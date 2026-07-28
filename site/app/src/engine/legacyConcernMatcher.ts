import type { PlayerAction } from './deliberation'
import {
  understandContribution,
  type DeliberationLanguagePack,
  type Understanding,
} from './deliberationLanguageV5'
import {
  memoryLabel,
  notesForOwner,
  PLAYER_NOTE_OWNER,
  type SittingNote,
} from '../lib/jurorNotes'
import type { DocketCase } from '../lib/v2/caseSchema'

export type ClaimedPosition = 'G' | 'NG' | 'U'

export interface ConcernInterpretation {
  understanding: Understanding
  beatId: string
  clarification: string | null
}

const EXTRA_ALIASES: Record<string, string[]> = {
  burden: ['reasonable doubt', 'must prove', 'burden of proof'],
  credibility: ['believable', 'lying', 'lied', 'trust the witness'],
  digital_forensics: ['device record', 'computer log', 'digital record'],
  identity: ['who did it', 'identification', 'recognition', 'identified the person'],
  method: ['testing method', 'expert method', 'how it was tested'],
  motive: ['reason to do it', 'benefit from it', 'motive'],
  procedure: ['investigation', 'police process', 'procedure'],
}

function words(value: string): string {
  return value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
}

export function legacyLanguagePack(
  trial: DocketCase,
  notes: SittingNote[],
): DeliberationLanguagePack {
  const tags = [...new Set(trial.beats.flatMap(({ tags: beatTags }) => beatTags))]
  const playerNotes = notesForOwner(notes, PLAYER_NOTE_OWNER)
  const noteByBeatId = new Map(playerNotes.map((note) => [note.beatId, note.text]))
  return {
    caseId: trial.id,
    issues: tags.map((tag) => ({
      id: tag,
      label: words(tag),
      aliases: unique([words(tag), ...(EXTRA_ALIASES[tag] ?? [])]),
    })),
    evidence: trial.beats.map((beat, index) => {
      const speaker = trial.cast.find(({ id }) => id === beat.speaker)
      return {
        id: beat.id,
        label: memoryLabel(trial, beat.id).title,
        aliases: unique([
          `point ${index + 1}`,
          speaker?.name,
          speaker?.role_label,
          noteByBeatId.get(beat.id),
          ...beat.tags.map(words),
        ]),
        issueIds: beat.tags,
      }
    }),
    propositions: [],
    responseMoves: [],
  }
}

export function interpretLegacyConcern(
  trial: DocketCase,
  notes: SittingNote[],
  text: string,
  preferredBeatId: string,
  targetSeat?: number,
): ConcernInterpretation {
  const understanding = understandContribution(
    text,
    legacyLanguagePack(trial, notes),
    targetSeat,
  )
  const matchedEvidenceIds = understanding.frame.evidenceIds.filter((beatId) =>
    trial.beats.some(({ id }) => id === beatId))
  // When several recollections match, keep the player's selected chip.
  const selectedEvidenceMatched = matchedEvidenceIds.includes(preferredBeatId)
  const ambiguousEvidence = matchedEvidenceIds.length > 1 && !selectedEvidenceMatched
  const evidenceBeat = selectedEvidenceMatched || ambiguousEvidence
    ? preferredBeatId
    : matchedEvidenceIds[0]
  const preferred = trial.beats.find(({ id }) => id === preferredBeatId)
  const issueBeat = understanding.frame.issueId
    ? (
        preferred?.tags.some((tag) => tag === understanding.frame.issueId)
          ? preferred
          : trial.beats.find(({ tags }) =>
              tags.some((tag) => tag === understanding.frame.issueId))
      )
    : undefined
  const beatId = evidenceBeat ?? issueBeat?.id ?? preferredBeatId
  return {
    understanding,
    beatId,
    clarification: ambiguousEvidence
      ? 'That could refer to more than one recollection. Choose the numbered point you mean, then use it anyway.'
      : understanding.needsClarification
      ? `${understanding.clarification} You can also choose a numbered recollection below, then use it anyway.`
      : null,
  }
}

export function actionForConcern(
  trial: DocketCase,
  concern: ConcernInterpretation,
  claimedPosition: ClaimedPosition,
  targetJurorId?: string,
): PlayerAction {
  const beat = trial.beats.find(({ id }) => id === concern.beatId)
  if (!beat) throw new Error(`Unknown concern beat ${concern.beatId}`)
  const shared = {
    beatId: beat.id,
    summary: concern.understanding.playerText.replace(/\s+/g, ' ').trim().slice(0, 500),
    targetJurorId,
  }
  // Legal directions stay neutral cites — never invert a burden/doubt
  // direction into a guilt or innocence push from the claimed button.
  if (beat.kind === 'direction') {
    return { type: 'cite_direction', push: 'neutral', ...shared }
  }
  if (claimedPosition === 'U') {
    return {
      type: 'argue',
      stance: 'probe',
      push: 'neutral',
      ...shared,
    }
  }
  return {
    type: 'argue',
    stance: claimedPosition === 'G' ? 'proves' : 'unreliable',
    push: claimedPosition === 'G' ? 'guilt' : 'innocence',
    ...shared,
  }
}
