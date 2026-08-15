import type { CourtSession, SceneCue } from '../model/schema'
import { authoredCueSourceId, joinAuthoredCueText } from './captionPacing'
import { FRIDAY_SOURCE_CUE_IDS, FRIDAY_SPEECH_CANDIDATE } from './fridaySpeechCandidate'
import { MONDAY_SOURCE_CUE_IDS, MONDAY_SPEECH_CANDIDATE } from './mondaySpeechCandidate'
import { elevenMinutesSessions } from './sessions'
import { SATURDAY_SOURCE_CUE_IDS, SATURDAY_SPEECH_CANDIDATE } from './saturdaySpeechCandidate'
import { assertReviewedSpeechCue, type ReviewedSpeechCue } from './speechReview'
import {
  SUNDAY_ANALYSIS_CANDIDATES, SUNDAY_BALLOT_BRANCHES, SUNDAY_DYNAMIC_SOURCE_CUE_IDS,
  SUNDAY_PROCEDURE_CANDIDATE, SUNDAY_RETURN_CANDIDATES, SUNDAY_SOURCE_CUE_IDS,
} from './sundaySpeechCandidate'
import { THURSDAY_SOURCE_CUE_IDS, THURSDAY_SPEECH_CANDIDATE } from './thursdaySpeechCandidate'
import { TUESDAY_SOURCE_CUE_IDS, TUESDAY_SPEECH_CANDIDATE } from './tuesdaySpeechCandidate'
import { WEDNESDAY_SOURCE_CUE_IDS, WEDNESDAY_SPEECH_CANDIDATE } from './wednesdaySpeechCandidate'

export type LedgerCandidateCue = ReviewedSpeechCue & {
  sourceCueId?: string | null; sourceCueIds?: readonly string[]; event?: string
  procedureStage?: string; guard?: string; verdict?: string; agreement?: string
  threshold?: string; lawfulRationale?: string; counterAnalysis?: string
}

export interface SpeechCandidateDay {
  day: string; sessionId: string; prefix: string; sourceCueIds: readonly string[]
  primary: readonly LedgerCandidateCue[]; variants: readonly LedgerCandidateCue[]
  dynamicSourceIds: readonly string[]; syntheticCueIds: readonly string[]
  variantKeys: readonly string[]
}

function standardDay(
  day: string, sessionId: string, prefix: string, sourceCueIds: readonly string[],
  primary: readonly LedgerCandidateCue[],
): SpeechCandidateDay {
  return { day, sessionId, prefix, sourceCueIds, primary, variants: [], dynamicSourceIds: [], syntheticCueIds: [], variantKeys: [] }
}

export const COURT_WEEK_SPEECH_CANDIDATES: readonly SpeechCandidateDay[] = [
  standardDay('monday', 'cw-0001-monday', 'mon-', MONDAY_SOURCE_CUE_IDS, MONDAY_SPEECH_CANDIDATE),
  standardDay('tuesday', 'cw-0001-tuesday', 'tue-', TUESDAY_SOURCE_CUE_IDS, TUESDAY_SPEECH_CANDIDATE),
  standardDay('wednesday', 'cw-0001-wednesday', 'wed-', WEDNESDAY_SOURCE_CUE_IDS, WEDNESDAY_SPEECH_CANDIDATE),
  standardDay('thursday', 'cw-0001-thursday', 'thu-', THURSDAY_SOURCE_CUE_IDS, THURSDAY_SPEECH_CANDIDATE),
  standardDay('friday', 'cw-0001-friday', 'fri-', FRIDAY_SOURCE_CUE_IDS, FRIDAY_SPEECH_CANDIDATE),
  standardDay('saturday', 'cw-0001-saturday', 'sat-', SATURDAY_SOURCE_CUE_IDS, SATURDAY_SPEECH_CANDIDATE),
  {
    day: 'sunday', sessionId: 'cw-0001-sunday', prefix: 'sun-', sourceCueIds: SUNDAY_SOURCE_CUE_IDS,
    primary: SUNDAY_PROCEDURE_CANDIDATE, variants: [...SUNDAY_RETURN_CANDIDATES, ...SUNDAY_ANALYSIS_CANDIDATES],
    dynamicSourceIds: SUNDAY_DYNAMIC_SOURCE_CUE_IDS, syntheticCueIds: ['sun-fresh-unanimity-ballot'],
    variantKeys: [
      'murder:unanimous', 'murder:majority', 'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority', 'unable-to-agree:hung',
      'analysis:murder', 'analysis:manslaughter', 'analysis:not-guilty', 'analysis:unable-to-agree',
    ],
  },
]

interface ActiveSource {
  id: string
  cues: SceneCue[]
  text: string
}

export interface SpeechReviewLedgerRow {
  day: string; cueIndex: number; turnIndex: number; cueId: string; sourceCueIds: readonly string[]
  captionIds: readonly string[]; activeSourceText: readonly (readonly [string, string])[]
  captionProjection: readonly { id: string; speaker: string; text: string }[]
  sourceText: string; turnId: string; actorId: string; displayLabel: string
  speechMode: string; legalAction: string; text: string
  quotes: readonly { start: number; end: number; source: string; sourceActorId: string | null; text: string }[]
  attributions: ReviewedSpeechCue['attributions']; event: string | null
  procedureStage: string | null; guard: string | null; variant: string | null
}

function activeSources(session: CourtSession): ActiveSource[] {
  const groups: ActiveSource[] = []
  for (const cue of session.scenes.flatMap(({ cues }) => cues)) {
    const id = authoredCueSourceId(cue)
    const current = groups.at(-1)
    if (current?.id === id) { current.cues.push(cue); current.text += ' ' + cue.text }
    else groups.push({ id, cues: [cue], text: cue.text })
  }
  return groups
}

function sourceIds(cue: LedgerCandidateCue): readonly string[] {
  return cue.sourceCueIds ?? (cue.sourceCueId ? [cue.sourceCueId] : [])
}

function variantKey(cue: LedgerCandidateCue): string {
  if (cue.verdict && cue.agreement) return cue.verdict + ':' + cue.agreement
  if (cue.verdict) return 'analysis:' + cue.verdict
  throw new Error(cue.id + ': runtime variant lacks verdict/agreement identity')
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requireSame(label: string, actual: unknown, expected: unknown): void {
  if (!same(actual, expected)) throw new Error(label + ': missing, stale, duplicated or reordered review rows')
}

/** Fail-closed reconciliation only; this does not feed active sessions, packs or media. */
export function assertCourtWeekSpeechCandidates(
  days: readonly SpeechCandidateDay[] = COURT_WEEK_SPEECH_CANDIDATES,
  sessions: readonly CourtSession[] = elevenMinutesSessions,
): void {
  requireSame('candidate days', days.map(({ day }) => day), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  requireSame('active sessions', sessions.map(({ id }) => id), days.map(({ sessionId }) => sessionId))
  const cueIds = new Set<string>(); const turnIds = new Set<string>()
  for (const day of days) {
    const session = sessions.find(({ id }) => id === day.sessionId)
    if (!session) throw new Error(day.day + ': active source session is missing')
    const allActiveCues = session.scenes.flatMap(({ cues }) => cues)
    const groups = activeSources(session)
    requireSame(day.day + ' source coverage', [...groups.map(({ id }) => id)].sort(), [...day.sourceCueIds].sort())
    if (new Set(groups.map(({ id }) => id)).size !== groups.length) throw new Error(day.day + ': non-contiguous or duplicated source cue')
    for (const group of groups) {
      if (!group.id.startsWith(day.prefix)) throw new Error(group.id + ': unknown day prefix')
      requireSame(group.id + ' caption ids', group.cues.map(({ id }) => id), group.cues.map((_, index) => index ? `${group.id}--caption-${index + 1}` : group.id))
      for (const cue of group.cues) {
        if (joinAuthoredCueText(allActiveCues, cue) !== group.text) throw new Error(group.id + ': caption text does not reconstruct its source')
        const first = group.cues[0]!
        for (const field of ['event', 'tone', 'evidenceIds', 'replayable', 'accessibleProposition'] as const) {
          if (!same(cue[field], first[field])) throw new Error(group.id + ': caption metadata disagrees on ' + field)
        }
        if (cue.admissionStatus !== (cue === first ? first.admissionStatus : undefined)) throw new Error(group.id + ': caption admission status is not source-only')
      }
    }
    const dynamic = new Set(day.dynamicSourceIds)
    requireSame(day.day + ' primary coverage', day.primary.flatMap(sourceIds), day.sourceCueIds.filter((id) => !dynamic.has(id)))
    requireSame(day.day + ' synthetic rows', day.primary.filter((cue) => !sourceIds(cue).length).map(({ id }) => id), day.syntheticCueIds)
    requireSame(day.day + ' runtime source coverage', [...new Set(day.variants.flatMap(sourceIds))].sort(), [...day.dynamicSourceIds].sort())
    requireSame(day.day + ' runtime branches', day.variants.map(variantKey), day.variantKeys)
    for (const cue of [...day.primary, ...day.variants]) {
      if (!cue.id.startsWith(day.prefix)) throw new Error(cue.id + ': unknown candidate prefix')
      if (cueIds.has(cue.id)) throw new Error(cue.id + ': duplicated candidate cue')
      cueIds.add(cue.id)
      for (const id of sourceIds(cue)) if (!day.sourceCueIds.includes(id)) throw new Error(cue.id + ': stale source row ' + id)
      if (cue.sourceText !== cue.turns.map(({ text }) => text).join(' ')) throw new Error(cue.id + ': dropped, duplicated or reordered turn words')
      assertReviewedSpeechCue(cue)
      for (const turn of cue.turns) {
        if (!turn.id.startsWith(cue.id + '__')) throw new Error(turn.id + ': unknown turn prefix')
        if (turnIds.has(turn.id)) throw new Error(turn.id + ': duplicated turn row')
        turnIds.add(turn.id)
        const literal = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
        const reviewed = (turn.quotedSpans ?? []).map((span) => turn.text.slice(span.start, span.end))
        requireSame(turn.id + ' quotation provenance', reviewed, literal)
      }
    }
  }
}

export function buildCourtWeekSpeechReviewLedger(
  days: readonly SpeechCandidateDay[] = COURT_WEEK_SPEECH_CANDIDATES,
  sessions: readonly CourtSession[] = elevenMinutesSessions,
): { schema: 'simjury.court-week-speech-review/v1'; branches: typeof SUNDAY_BALLOT_BRANCHES; rows: SpeechReviewLedgerRow[] } {
  assertCourtWeekSpeechCandidates(days, sessions)
  const rows: SpeechReviewLedgerRow[] = []
  for (const day of days) {
    const session = sessions.find(({ id }) => id === day.sessionId)!
    const activeById = new Map(activeSources(session).map((source) => [source.id, source]))
    for (const [cueIndex, cue] of [...day.primary, ...day.variants].entries()) {
      const sources = sourceIds(cue); const variant = day.variants.includes(cue) ? variantKey(cue) : null
      for (const [turnIndex, turn] of cue.turns.entries()) rows.push({
        day: day.day, cueIndex, turnIndex, cueId: cue.id, sourceCueIds: sources,
        captionIds: sources.flatMap((id) => activeById.get(id)?.cues.map(({ id: cueId }) => cueId) ?? []),
        captionProjection: sources.flatMap((id) => activeById.get(id)?.cues
          .map(({ id, speaker, text }) => ({ id, speaker, text })) ?? []),
        activeSourceText: sources.map((id) => [id, activeById.get(id)!.text] as const),
        sourceText: cue.sourceText, turnId: turn.id, actorId: turn.actorId, displayLabel: turn.displayLabel,
        speechMode: turn.speechMode, legalAction: turn.legalAction, text: turn.text,
        quotes: (turn.quotedSpans ?? []).map((span) => ({ ...span, sourceActorId: span.sourceActorId ?? null, text: turn.text.slice(span.start, span.end) })),
        attributions: cue.attributions ?? [], event: cue.event ?? null, procedureStage: cue.procedureStage ?? null,
        guard: cue.guard ?? null, variant,
      })
    }
  }
  return { schema: 'simjury.court-week-speech-review/v1', branches: SUNDAY_BALLOT_BRANCHES, rows }
}
