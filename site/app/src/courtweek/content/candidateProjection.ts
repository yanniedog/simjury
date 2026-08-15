import { createHash } from 'node:crypto'
import type { CourtSession, SceneCue } from '../model/schema'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import {
  assertCourtWeekSpeechCandidates,
  COURT_WEEK_SPEECH_CANDIDATES,
  type LedgerCandidateCue,
  type SpeechCandidateDay,
} from './speechReviewLedger'

export const COURT_WEEK_CANDIDATE_PROJECTION_SCHEMA = 'simjury.court-week-candidate-projection/v1' as const

const SYNTHETIC_PLACEMENTS = {
  'sun-fresh-unanimity-ballot': {
    afterSourceCueId: 'sun-further-discussion',
    beforeSourceCueId: 'sun-majority-direction',
  },
} as const

type SourceMetadata = Pick<SceneCue,
  | 'event' | 'tone' | 'evidenceIds' | 'replayable' | 'admissionStatus'
  | 'accessibleProposition' | 'closingPropositions' | 'nonEvidenceClosingText'>

interface SourceGroup {
  id: string
  sceneId: string
  captionCueIds: string[]
  metadata: SourceMetadata
}

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}

const digest = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`

function sourceMetadata(cue: SceneCue): SourceMetadata {
  const {
    event, tone, evidenceIds, replayable, admissionStatus,
    accessibleProposition, closingPropositions, nonEvidenceClosingText,
  } = cue
  return {
    event, tone, evidenceIds, replayable, accessibleProposition,
    ...(admissionStatus ? { admissionStatus } : {}),
    ...(closingPropositions ? { closingPropositions } : {}),
    ...(nonEvidenceClosingText ? { nonEvidenceClosingText } : {}),
  }
}

function sourceGroups(session: CourtSession): Map<string, SourceGroup> {
  const groups = new Map<string, SourceGroup>()
  for (const scene of session.scenes) for (const cue of scene.cues) {
    const id = authoredCueSourceId(cue)
    const existing = groups.get(id)
    if (existing) {
      if (existing.sceneId !== scene.id) throw new Error(`${id}: caption group crosses scenes`)
      const current = sourceMetadata(cue)
      if (current.admissionStatus !== undefined
        || canonicalJson({ ...existing.metadata, admissionStatus: undefined })
          !== canonicalJson({ ...current, admissionStatus: undefined })) {
        throw new Error(`${id}: caption metadata has drifted`)
      }
      existing.captionCueIds.push(cue.id)
    } else groups.set(id, {
      id, sceneId: scene.id, captionCueIds: [cue.id], metadata: sourceMetadata(cue),
    })
  }
  return groups
}

function sourceIds(cue: LedgerCandidateCue): readonly string[] {
  return cue.sourceCueIds ?? (cue.sourceCueId ? [cue.sourceCueId] : [])
}

function variantKey(cue: LedgerCandidateCue): string | null {
  if (cue.verdict && cue.agreement) return `${cue.verdict}:${cue.agreement}`
  return cue.verdict ? `analysis:${cue.verdict}` : null
}

function projectCue(cue: LedgerCandidateCue, sources: Map<string, SourceGroup>) {
  const ids = sourceIds(cue)
  const groups = ids.map((id) => {
    const source = sources.get(id)
    if (!source) throw new Error(`${cue.id}: missing active source ${id}`)
    return source
  })
  const sceneIds = [...new Set(groups.map(({ sceneId }) => sceneId))]
  if (sceneIds.length > 1) throw new Error(`${cue.id}: projection crosses active scenes`)
  const placement = SYNTHETIC_PLACEMENTS[cue.id as keyof typeof SYNTHETIC_PLACEMENTS]
  if (!groups.length && !placement) throw new Error(`${cue.id}: synthetic cue has no reviewed placement`)
  if (groups.length && placement) throw new Error(`${cue.id}: sourced cue cannot also be synthetic`)
  if (placement && (!sources.has(placement.afterSourceCueId) || !sources.has(placement.beforeSourceCueId))) {
    throw new Error(`${cue.id}: synthetic placement anchors are stale`)
  }
  return {
    id: cue.id,
    sourceCueIds: ids,
    sceneId: sceneIds[0] ?? null,
    captionCueIds: groups.flatMap(({ captionCueIds }) => captionCueIds),
    sourceMetadata: groups.map(({ id, metadata }) => ({ id, ...metadata })),
    turns: cue.turns.map((turn) => ({ ...turn, quotedSpans: turn.quotedSpans?.map((span) => ({ ...span })) })),
    sourceText: cue.sourceText,
    variant: variantKey(cue),
    procedureStage: cue.procedureStage ?? null,
    guard: cue.guard ?? null,
    syntheticPlacement: placement ?? null,
  }
}

/** Inactive only: creates the exact reviewed input for a future atomic content/media revision. */
export function buildCourtWeekCandidateProjection(
  days: readonly SpeechCandidateDay[] = COURT_WEEK_SPEECH_CANDIDATES,
  sessions: readonly CourtSession[] = elevenMinutesCourtWeek.manifest.sessions,
) {
  assertCourtWeekSpeechCandidates(days, sessions)
  const projectedDays = days.map((day) => {
    const session = sessions.find(({ id }) => id === day.sessionId)
    if (!session) throw new Error(`${day.day}: active session is missing`)
    const sources = sourceGroups(session)
    const primary = day.primary.map((cue) => projectCue(cue, sources))
    const variants = day.variants.map((cue) => projectCue(cue, sources))
    return {
      day: day.day, sessionId: day.sessionId,
      sourceCueIds: [...day.sourceCueIds], primary, variants,
    }
  })
  const payload = {
    schema: COURT_WEEK_CANDIDATE_PROJECTION_SCHEMA,
    caseId: elevenMinutesCourtWeek.manifest.id,
    currentRevision: elevenMinutesCourtWeek.manifest.revision,
    days: projectedDays,
  }
  const cues = projectedDays.flatMap(({ primary, variants }) => [...primary, ...variants])
  return {
    ...payload,
    candidateDigest: digest(payload),
    impact: {
      days: projectedDays.length,
      activeSourceCueIds: new Set(projectedDays.flatMap(({ sourceCueIds }) => sourceCueIds)).size,
      candidateCues: cues.length,
      turns: cues.reduce((count, cue) => count + cue.turns.length, 0),
      captionCueIds: new Set(cues.flatMap(({ captionCueIds }) => captionCueIds)).size,
      actorIds: [...new Set(cues.flatMap(({ turns }) => turns.map(({ actorId }) => actorId)))].sort(),
      runtimeVariants: cues.filter(({ variant }) => variant).map(({ variant }) => variant),
      syntheticCueIds: cues.filter(({ syntheticPlacement }) => syntheticPlacement).map(({ id }) => id),
    },
  }
}
