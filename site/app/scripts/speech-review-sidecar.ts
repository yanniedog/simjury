import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { authoredCueSourceId } from '../src/courtweek/content/captionPacing'
import { elevenMinutesSessions } from '../src/courtweek/content/sessions'
import { COURT_WEEK_ACTORS } from '../src/courtweek/content/speechReview'
import {
  buildCourtWeekSpeechReviewLedger, type SpeechReviewLedgerRow,
} from '../src/courtweek/content/speechReviewLedger'

export const REVIEW_DIMENSIONS = [
  'attribution', 'chronology', 'legalAccuracy', 'evidentiarySupport',
  'neutrality', 'plainLanguage', 'sensitivity', 'readAloud',
] as const

type ReviewDimension = typeof REVIEW_DIMENSIONS[number]
type ReviewDecision = {
  status: 'pending' | 'approved' | 'changes-required'
  reviewReference: string | null
  note: string | null
}
type Token = [text: string, start: number, end: number, kind: 'word' | 'punctuation']
type LegalState = {
  rowId: string; cueId: string; runtimeVariant: string | null; legalPhases: string[]
  sourceEvents: string[]; candidateEvent: string | null; legalAction: string; procedureStage: string | null
}

export type SpeechReviewSidecarRow = {
  rowId: string; day: string; cueId: string; turnId: string; runtimeVariant: string | null
  sourceCueIds: readonly string[]; captionIds: readonly string[]
  sourceSha256: string; candidateSha256: string; ledgerRowSha256: string
  actor: { id: string; role: string; displayLabel: string }
  speechMode: string; legalAction: string
  candidateTokens: Token[]
  quoteProvenance: SpeechReviewLedgerRow['quotes']
  legalEffect: { legalPhases: string[]; sourceEvents: string[]; candidateEvent: string | null; procedureStage: string | null; guard: string | null }
  evidenceEffect: { evidenceIds: string[]; admissionStatuses: string[]; replayable: boolean; accessiblePropositions: string[] }
  precedingLegalState: LegalState | null; followingLegalState: LegalState | null
  decisions: Record<ReviewDimension, ReviewDecision>
}

export type SpeechReviewSidecar = {
  schema: 'simjury.court-week-speech-review-sidecar/v1'; caseId: string; sourceRevision: string
  hashAlgorithm: 'sha256'; ledgerSha256: string; runtimeVariants: string[]
  tokenTupleFields: ['text', 'start', 'end', 'kind']
  sources: { sourceCueId: string; sourceSha256: string; tokens: Token[] }[]
  rows: SpeechReviewSidecarRow[]
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
export const SPEECH_REVIEW_SIDECAR_PATH = resolve(
  scriptDirectory, '../content-reviews/cw-0001.speech-review-sidecar.json',
)
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')
const unique = (values: readonly string[]): string[] => [...new Set(values)]
const tokenPattern = /[\p{L}\p{M}\p{N}]+(?:[\u2019'-][\p{L}\p{M}\p{N}]+)*|[^\s]/gu
const wordPattern = /^[\p{L}\p{M}\p{N}]/u

export function tokeniseForReview(text: string): Token[] {
  return [...text.matchAll(tokenPattern)].map((match) => [
    match[0], match.index, match.index + match[0].length,
    wordPattern.test(match[0]) ? 'word' : 'punctuation',
  ])
}

type SourceEffect = {
  legalPhases: string[]; sourceEvents: string[]; evidenceIds: string[]
  admissionStatuses: string[]; replayable: boolean; accessiblePropositions: string[]
}

function sourceEffects(): Map<string, SourceEffect> {
  const effects = new Map<string, SourceEffect>()
  for (const session of elevenMinutesSessions) for (const scene of session.scenes) for (const cue of scene.cues) {
    const id = authoredCueSourceId(cue)
    const effect = effects.get(id) ?? {
      legalPhases: [], sourceEvents: [], evidenceIds: [], admissionStatuses: [],
      replayable: false, accessiblePropositions: [],
    }
    effect.legalPhases = unique([...effect.legalPhases, scene.phase])
    effect.sourceEvents = unique([...effect.sourceEvents, cue.event])
    effect.evidenceIds = unique([...effect.evidenceIds, ...cue.evidenceIds])
    if (cue.admissionStatus) effect.admissionStatuses = unique([...effect.admissionStatuses, cue.admissionStatus])
    effect.replayable ||= cue.replayable
    effect.accessiblePropositions = unique([
      ...effect.accessiblePropositions, cue.accessibleProposition,
    ])
    effects.set(id, effect)
  }
  for (const effect of effects.values()) if (!effect.admissionStatuses.length) {
    effect.admissionStatuses = ['not-specified']
  }
  return effects
}

const pendingDecisions = (): Record<ReviewDimension, ReviewDecision> => Object.fromEntries(
  REVIEW_DIMENSIONS.map((dimension) => [dimension, {
    status: 'pending', reviewReference: null, note: null,
  }]),
) as Record<ReviewDimension, ReviewDecision>

function stateFor(row: SpeechReviewSidecarRow): LegalState {
  return {
    rowId: row.rowId, cueId: row.cueId, runtimeVariant: row.runtimeVariant,
    legalPhases: row.legalEffect.legalPhases, sourceEvents: row.legalEffect.sourceEvents,
    candidateEvent: row.legalEffect.candidateEvent, legalAction: row.legalAction,
    procedureStage: row.legalEffect.procedureStage,
  }
}

function isDeterministicNeighbour(current: SpeechReviewSidecarRow, neighbour: SpeechReviewSidecarRow | undefined): neighbour is SpeechReviewSidecarRow {
  if (!neighbour || current.day !== neighbour.day) return false
  if (current.cueId === neighbour.cueId && current.runtimeVariant === neighbour.runtimeVariant) return true
  return current.day !== 'sunday' && current.runtimeVariant === null && neighbour.runtimeVariant === null
}

export function buildSpeechReviewSidecar(): SpeechReviewSidecar {
  const ledger = buildCourtWeekSpeechReviewLedger()
  const actors = new Map(COURT_WEEK_ACTORS.map((actor) => [actor.id, actor]))
  const effects = sourceEffects()
  const rows: SpeechReviewSidecarRow[] = ledger.rows.map((row) => {
    const actor = actors.get(row.actorId as typeof COURT_WEEK_ACTORS[number]['id'])
    if (!actor) throw new Error(`${row.turnId}: sidecar actor is missing`)
    const sourceEffect = row.sourceCueIds.map((id) => effects.get(id)).filter(
      (effect): effect is SourceEffect => Boolean(effect),
    )
    if (sourceEffect.length !== row.sourceCueIds.length) throw new Error(`${row.turnId}: sidecar source effect is missing`)
    return {
      rowId: row.turnId, day: row.day, cueId: row.cueId, turnId: row.turnId,
      runtimeVariant: row.variant, sourceCueIds: row.sourceCueIds, captionIds: row.captionIds,
      sourceSha256: sha256(JSON.stringify(row.activeSourceText)), candidateSha256: sha256(row.text),
      ledgerRowSha256: sha256(JSON.stringify(row)),
      actor: { id: actor.id, role: actor.role, displayLabel: row.displayLabel },
      speechMode: row.speechMode, legalAction: row.legalAction,
      candidateTokens: tokeniseForReview(row.text), quoteProvenance: row.quotes,
      legalEffect: {
        legalPhases: unique(sourceEffect.flatMap(({ legalPhases }) => legalPhases)),
        sourceEvents: unique(sourceEffect.flatMap(({ sourceEvents }) => sourceEvents)),
        candidateEvent: row.event, procedureStage: row.procedureStage, guard: row.guard,
      },
      evidenceEffect: {
        evidenceIds: unique(sourceEffect.flatMap(({ evidenceIds }) => evidenceIds)),
        admissionStatuses: unique(sourceEffect.flatMap(({ admissionStatuses }) => admissionStatuses)),
        replayable: sourceEffect.some(({ replayable }) => replayable),
        accessiblePropositions: unique(sourceEffect.flatMap(({ accessiblePropositions }) => accessiblePropositions)),
      },
      precedingLegalState: null, followingLegalState: null, decisions: pendingDecisions(),
    }
  })
  for (const [index, row] of rows.entries()) {
    const preceding = rows[index - 1]; const following = rows[index + 1]
    row.precedingLegalState = isDeterministicNeighbour(row, preceding) ? stateFor(preceding) : null
    row.followingLegalState = isDeterministicNeighbour(row, following) ? stateFor(following) : null
  }
  const sourceTexts = new Map<string, string>()
  for (const row of ledger.rows) for (const [sourceCueId, text] of row.activeSourceText) {
    const current = sourceTexts.get(sourceCueId)
    if (current !== undefined && current !== text) throw new Error(`${sourceCueId}: source text is inconsistent`)
    sourceTexts.set(sourceCueId, text)
  }
  return {
    schema: 'simjury.court-week-speech-review-sidecar/v1',
    caseId: elevenMinutesCourtWeek.manifest.id, sourceRevision: elevenMinutesCourtWeek.manifest.revision,
    hashAlgorithm: 'sha256', ledgerSha256: sha256(JSON.stringify(ledger)),
    tokenTupleFields: ['text', 'start', 'end', 'kind'],
    runtimeVariants: unique(ledger.rows.flatMap(({ variant }) => variant ? [variant] : [])).sort(),
    sources: [...sourceTexts].map(([sourceCueId, text]) => ({
      sourceCueId, sourceSha256: sha256(text), tokens: tokeniseForReview(text),
    })),
    rows,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function immutableReviewData(value: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...value }
  copy.rows = (value.rows as Record<string, unknown>[]).map((row) => {
    const immutableRow = { ...row }
    delete immutableRow.decisions
    return immutableRow
  })
  return copy
}

function isPristinePendingSidecar(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.rows) || !value.rows.length) return false
  return value.rows.every((row) => {
    if (!isRecord(row) || !isRecord(row.decisions)) return false
    const decisions = row.decisions
    return Object.keys(decisions).length === REVIEW_DIMENSIONS.length && REVIEW_DIMENSIONS.every((dimension) => {
      const decision = decisions[dimension]
      return isRecord(decision) && decision.status === 'pending' &&
        decision.reviewReference === null && decision.note === null
    })
  })
}

export function assertSpeechReviewSidecar(value: unknown): asserts value is SpeechReviewSidecar {
  const expected = buildSpeechReviewSidecar()
  if (!isRecord(value) || !Array.isArray(value.rows)) throw new Error('speech review sidecar is malformed')
  if (value.rows.length !== expected.rows.length) throw new Error('speech review sidecar has missing or extra rows')
  for (const [index, candidate] of value.rows.entries()) {
    if (!isRecord(candidate) || !isRecord(candidate.decisions)) throw new Error(`speech review row ${index} is malformed`)
    const keys = Object.keys(candidate.decisions).sort()
    if (JSON.stringify(keys) !== JSON.stringify([...REVIEW_DIMENSIONS].sort())) {
      throw new Error(`${String(candidate.rowId ?? index)}: review dimensions are missing or extra`)
    }
    for (const dimension of REVIEW_DIMENSIONS) {
      const decision = candidate.decisions[dimension]
      if (!isRecord(decision) || !['pending', 'approved', 'changes-required'].includes(String(decision.status))) {
        throw new Error(`${String(candidate.rowId ?? index)}: ${dimension} decision is malformed`)
      }
      if (JSON.stringify(Object.keys(decision).sort()) !== JSON.stringify(['note', 'reviewReference', 'status'])) {
        throw new Error(`${String(candidate.rowId ?? index)}: ${dimension} decision fields are missing or extra`)
      }
      if ((decision.reviewReference !== null && typeof decision.reviewReference !== 'string') ||
          (decision.note !== null && typeof decision.note !== 'string')) {
        throw new Error(`${String(candidate.rowId ?? index)}: ${dimension} decision text is malformed`)
      }
      if (decision.status !== 'pending' && (typeof decision.reviewReference !== 'string' || !decision.reviewReference.trim())) {
        throw new Error(`${String(candidate.rowId ?? index)}: ${dimension} approval/change needs a review reference`)
      }
    }
  }
  if (JSON.stringify(immutableReviewData(value)) !== JSON.stringify(immutableReviewData(expected))) {
    throw new Error('speech review sidecar is stale or reordered')
  }
}

export async function writeSpeechReviewSidecar(path = SPEECH_REVIEW_SIDECAR_PATH): Promise<void> {
  const generated = buildSpeechReviewSidecar()
  let existing: SpeechReviewSidecar | null = null
  try {
    const raw = await readFile(path, 'utf8')
    let candidate: unknown
    try { candidate = JSON.parse(raw) } catch { throw new Error(`refusing to overwrite invalid speech review sidecar: ${path}`) }
    try {
      assertSpeechReviewSidecar(candidate)
      existing = candidate
    } catch (error) {
      if (!isPristinePendingSidecar(candidate)) throw error
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (existing) for (const [index, row] of generated.rows.entries()) {
    row.decisions = existing.rows[index]!.decisions
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(generated) + '\n', 'utf8')
}

export async function verifySpeechReviewSidecarFile(path = SPEECH_REVIEW_SIDECAR_PATH): Promise<void> {
  let raw: string
  try { raw = await readFile(path, 'utf8') } catch { throw new Error(`speech review sidecar is missing: ${path}`) }
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error(`speech review sidecar is not valid JSON: ${path}`) }
  assertSpeechReviewSidecar(value)
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const action = process.argv[2]
  if (action === '--write') await writeSpeechReviewSidecar()
  else if (action === '--verify') await verifySpeechReviewSidecarFile()
  else throw new Error('usage: tsx scripts/speech-review-sidecar.ts --write|--verify')
}
