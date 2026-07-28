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
  return {
    caseId: trial.id,
    issues: tags.map((tag) => ({
      id: tag,
      label: words(tag),
      aliases: unique([words(tag), ...(EXTRA_ALIASES[tag] ?? [])]),
    })),
    evidence: trial.beats.map((beat, index) => {
      const speaker = trial.cast.find(({ id }) => id === beat.speaker)
      const note = notesForOwner(notes, PLAYER_NOTE_OWNER)
        .find(({ beatId }) => beatId === beat.id)?.text
      return {
        id: beat.id,
        label: memoryLabel(trial, beat.id).title,
        aliases: unique([
          `point ${index + 1}`,
          speaker?.name,
          speaker?.role_label,
          note,
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
  const evidenceBeat = understanding.frame.evidenceIds.find((beatId) =>
    trial.beats.some(({ id }) => id === beatId))
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
    clarification: understanding.needsClarification
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
  const push =
    claimedPosition === 'G'
      ? 'guilt'
      : claimedPosition === 'NG'
        ? 'innocence'
        : 'neutral'
  if (beat.kind === 'direction') return { type: 'cite_direction', push, ...shared }
  return {
    type: 'argue',
    stance: claimedPosition === 'G' ? 'proves' : 'unreliable',
    push,
    ...shared,
  }
}
