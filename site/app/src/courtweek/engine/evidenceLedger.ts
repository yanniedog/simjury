import { authoredCueSourceId } from '../content/captionPacing'
import type { CourtSession, EvidenceItem, SceneCue, TrialRecord } from '../model/schema'

export type EvidenceAdmissionState = 'unavailable' | 'provisional' | 'admitted' | 'struck'
export type EvidenceTransitionBasis =
  | 'provisional-admission' | 'final-admission' | 'oral-expert-evidence' | 'strike'

export interface EvidenceLedgerTransition {
  cueId: string
  state: Exclude<EvidenceAdmissionState, 'unavailable'>
  basis: EvidenceTransitionBasis
}

export interface EvidenceLedgerEntry {
  evidence: EvidenceItem
  state: EvidenceAdmissionState
  transitions: readonly EvidenceLedgerTransition[]
  effectiveTransition?: EvidenceLedgerTransition
}

export interface EvidenceLedgerCursor {
  /** A paced cue id or its canonical source cue id. */
  cueId: string
  /** Include the legal effect only after the complete authored cue has finished. */
  authoredCueComplete?: boolean
}

interface AuthoredCue {
  id: string
  cue: SceneCue
  evidenceIds: readonly string[]
  pacedCueIds: string[]
}
interface CandidateTransition extends EvidenceLedgerTransition { evidenceId: string }

function orderedAuthoredCues(sessions: readonly CourtSession[]): AuthoredCue[] {
  const result: AuthoredCue[] = []
  for (const cue of sessions.flatMap(({ scenes }) => scenes.flatMap(({ cues }) => cues))) {
    const sourceId = authoredCueSourceId(cue)
    const previous = result.at(-1)
    if (previous?.id === sourceId) {
      previous.pacedCueIds.push(cue.id)
      continue
    }
    if (result.some(({ id }) => id === sourceId)) {
      throw new Error(`${sourceId}: authored cue fragments must be contiguous`)
    }
    result.push({
      id: sourceId,
      cue,
      evidenceIds: cue.evidenceIds,
      pacedCueIds: [cue.id],
    })
  }
  return result
}

function transitionsAtCue(trial: TrialRecord, authored: AuthoredCue): CandidateTransition[] {
  const transitions: CandidateTransition[] = []
  for (const evidenceId of authored.evidenceIds) {
    const evidence = trial.evidence.find(({ id }) => id === evidenceId)
    if (!evidence) throw new Error(`${authored.id}: unknown evidence ${evidenceId}`)
    if (authored.cue.admissionStatus === 'provisional') {
      transitions.push({ evidenceId, cueId: authored.id, state: 'provisional', basis: 'provisional-admission' })
    } else if (authored.cue.admissionStatus === 'final' || authored.cue.event === 'exhibit-admitted') {
      transitions.push({ evidenceId, cueId: authored.id, state: 'admitted', basis: 'final-admission' })
    } else if (evidence.kind === 'expert-opinion' && authored.cue.event.startsWith('witness-')) {
      transitions.push({ evidenceId, cueId: authored.id, state: 'admitted', basis: 'oral-expert-evidence' })
    }
  }
  for (const objection of trial.objections) {
    if (objection.cueId === authored.id && objection.ruling === 'sustained' && objection.struckEvidenceId) {
      transitions.push({
        evidenceId: objection.struckEvidenceId, cueId: authored.id, state: 'struck', basis: 'strike',
      })
    }
  }
  return transitions
}

export function deriveEvidenceLedger(
  trial: TrialRecord,
  sessions: readonly CourtSession[],
  cursor: EvidenceLedgerCursor,
): readonly EvidenceLedgerEntry[] {
  const authoredCues = orderedAuthoredCues(sessions)
  const cursorIndex = authoredCues.findIndex(({ id, pacedCueIds }) => (
    id === cursor.cueId || pacedCueIds.includes(cursor.cueId)
  ))
  if (cursorIndex < 0) throw new Error(`Evidence cursor references unknown cue ${cursor.cueId}`)
  const cursorCue = authoredCues[cursorIndex]!
  if (cursor.authoredCueComplete && cursor.cueId !== cursorCue.id && cursor.cueId !== cursorCue.pacedCueIds.at(-1)) {
    throw new Error(`${cursor.cueId}: a partial caption cue cannot complete its authored legal event`)
  }
  const includedCueCount = cursorIndex + (cursor.authoredCueComplete ? 1 : 0)
  const transitions = new Map<string, EvidenceLedgerTransition[]>()
  for (const authored of authoredCues.slice(0, includedCueCount)) {
    for (const transition of transitionsAtCue(trial, authored)) {
      const history = transitions.get(transition.evidenceId) ?? []
      const previous = history.at(-1)?.state
      if (previous === 'struck' || (previous === 'admitted' && transition.state === 'provisional')) {
        throw new Error(`${transition.evidenceId}: invalid evidence-state regression at ${transition.cueId}`)
      }
      const publicTransition: EvidenceLedgerTransition = {
        cueId: transition.cueId, state: transition.state, basis: transition.basis,
      }
      transitions.set(transition.evidenceId, [...history, publicTransition])
    }
  }
  return trial.evidence.map((evidence) => {
    const history = transitions.get(evidence.id) ?? []
    const effectiveTransition = history.at(-1)
    return {
      evidence,
      state: effectiveTransition?.state ?? 'unavailable',
      transitions: history,
      ...(effectiveTransition ? { effectiveTransition } : {}),
    }
  })
}

export function evidenceState(
  ledger: readonly EvidenceLedgerEntry[], evidenceId: string,
): EvidenceAdmissionState {
  return ledger.find(({ evidence }) => evidence.id === evidenceId)?.state ?? 'unavailable'
}
