import { useEffect, useRef, useState } from 'react'
import { authoredCueSourceId } from '../content/captionPacing'
import { observedCourtCues, type EvidenceLedgerEntry } from '../engine/evidenceLedger'
import type {
  CourtEvent, CourtSession, DeliberationPack, LegalPhase, TrialRecord, Verdict, WeeklyProgress,
} from '../model/schema'
import { reasoningMoveLabels } from '../model/deliberationContract'
import {
  downloadWeeklyProgress,
  importWeeklyProgress,
  MAX_PROGRESS_TRANSFER_BYTES,
} from '../state/progress'
import { formatCourtUnlock } from '../state/schedule'
import { CourtSheet } from './CourtSheet'

const phaseLabels: Record<LegalPhase, string> = {
  arrival: 'Arrival and empanelment', 'crown-case': 'Crown case', 'defence-case': 'Defence case',
  addresses: 'Closing addresses', directions: 'Judge’s directions', deliberation: 'Deliberation',
  verdict: 'Verdict in open court', analysis: 'Post-verdict analysis',
}
const directionEvents = new Set<CourtEvent>([
  'preliminary-direction', 'silence-direction', 'summing-up', 'judge-response',
  'perseverance-direction', 'majority-direction',
])
const rulingEvents = new Set<CourtEvent>(['objection', 'ruling'])
export const MAX_PROGRESS_IMPORT_BYTES = MAX_PROGRESS_TRANSFER_BYTES

export interface PreparedProgressImport {
  progress: WeeklyProgress
  sessions: CourtSession[]
  commit: (progress: WeeklyProgress) => Promise<WeeklyProgress>
}

const verdictLabels: Record<Verdict, string> = {
  murder: 'Guilty of murder',
  manslaughter: 'Guilty of manslaughter by criminal negligence',
  'not-guilty': 'Not Guilty',
  'unable-to-agree': 'Unable to agree',
}

export interface JurorDeskProps {
  caseTitle: string
  trial: TrialRecord
  sessions: CourtSession[]
  deliberation?: DeliberationPack
  progress: WeeklyProgress
  activeSessionId: string
  activePhase: LegalPhase
  currentCueId: string
  currentCueComplete?: boolean
  evidenceLedger: readonly EvidenceLedgerEntry[]
  saveStatus: string
  readOnly?: boolean
  inactive?: boolean
  fallbackReturnFocusSelector?: string
  onNotesChange: (notes: string) => void
  prepareImport?: (text: string) => Promise<PreparedProgressImport>
  onImport: (candidate: PreparedProgressImport) => Promise<void>
  progressTransferEnabled?: boolean
  progressImportEnabled?: boolean
  onInspectEvidence: (evidenceId: string, trigger: HTMLButtonElement) => void
  onClose: () => void
}

export function JurorDesk({
  caseTitle,
  trial,
  sessions,
  deliberation,
  progress,
  activeSessionId,
  activePhase,
  currentCueId,
  currentCueComplete = false,
  evidenceLedger,
  saveStatus,
  readOnly = false,
  inactive = false,
  fallbackReturnFocusSelector,
  onNotesChange,
  prepareImport,
  onImport,
  progressTransferEnabled = true,
  progressImportEnabled = true,
  onInspectEvidence,
  onClose,
}: JurorDeskProps) {
  const importInput = useRef<HTMLInputElement>(null)
  const importButton = useRef<HTMLButtonElement>(null)
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [candidate, setCandidate] = useState<PreparedProgressImport | null>(null)
  const observedCues = observedCourtCues(sessions, {
    cueId: currentCueId, authoredCueComplete: currentCueComplete,
  })
  const uniqueCues = (events: ReadonlySet<CourtEvent>) => Array.from(new Map(observedCues
    .filter(({ event }) => events.has(event)).map((cue) => [authoredCueSourceId(cue), cue])).values())
  const duty = trial.offences.find(({ id }) => id === 'orinth-eca-s41')
  const directions = uniqueCues(directionEvents).filter(({ event }) => (
    !(progress.secondBallotWasUnanimous && (
      event === 'perseverance-direction' || event === 'majority-direction'
    )) && !(event === 'majority-direction' && !progress.majorityDirectionReceived)
  ))
  const rulings = uniqueCues(rulingEvents)
  const availableEvidence = evidenceLedger.filter(({ state }) => state === 'provisional' || state === 'admitted')
  const struckCount = evidenceLedger.filter(({ state }) => state === 'struck').length
  const reasoning = progress.reasoningContributions ?? []

  useEffect(() => {
    if (candidate) previewHeading.current?.focus()
  }, [candidate])

  const leavePreview = () => {
    setCandidate(null)
    setImportError(null)
    window.setTimeout(() => importButton.current?.focus(), 0)
  }

  const readImport = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_PROGRESS_IMPORT_BYTES) {
      setImportError('That file is too large. SimJury progress files must be 1 MB or smaller.')
      if (importInput.current) importInput.current.value = ''
      return
    }
    setImportBusy(true)
    try {
      const text = await file.text()
      const prepared = prepareImport
        ? await prepareImport(text)
        : (() => {
            const imported = importWeeklyProgress(
              text,
              progress.courtWeekId,
              progress.revision,
              deliberation,
              sessions,
            )
            return { progress: imported, sessions, commit: async (confirmed: WeeklyProgress) => confirmed }
          })()
      setCandidate(prepared)
      setImportError(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Progress could not be imported.')
    } finally {
      setImportBusy(false)
      if (importInput.current) importInput.current.value = ''
    }
  }

  const confirmImport = async () => {
    if (!candidate || importBusy) return
    setImportBusy(true)
    try {
      await onImport(candidate)
      leavePreview()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Progress could not be imported.')
    } finally {
      setImportBusy(false)
    }
  }

  const candidateProgress = candidate?.progress
  const candidateSessions = candidate?.sessions ?? sessions
  const completedDays = candidateProgress
    ? candidateSessions.filter(({ id }) => candidateProgress.completedSessionIds.includes(id)).map(({ day }) => day)
    : []
  const currentSession = candidateProgress
    ? candidateSessions.find(({ id }) => id === candidateProgress.currentSessionId)
    : undefined
  const currentScene = currentSession?.scenes.find(({ id }) => id === candidateProgress?.currentSceneId)
  const phase = (currentScene?.phase ?? 'session').replace(/-/gu, ' ')
  const currentPhase = candidateProgress?.completedSessionIds.length === candidateSessions.length
    ? 'Court Week complete'
    : currentSession
      ? `${currentSession.day}: ${phase.charAt(0).toUpperCase()}${phase.slice(1)}${currentScene ? ` - ${currentScene.title}` : ''}`
      : 'Not recorded'
  const ballots: Array<[string, Verdict]> = []
  if (candidateProgress?.provisionalVote) ballots.push(['Provisional', candidateProgress.provisionalVote])
  if (candidateProgress?.secondVote) ballots.push(['Second', candidateProgress.secondVote])
  if (candidateProgress?.freshUnanimityVote) ballots.push(['Fresh unanimity', candidateProgress.freshUnanimityVote])
  if (candidateProgress?.finalVote) ballots.push(['Final', candidateProgress.finalVote])
  const transferActions = progressTransferEnabled ? candidateProgress ? (
    <div className="cw-desk__transfer-actions">
      <div className="cw-button-row" role="group" aria-label="Import confirmation">
        <button type="button" disabled={importBusy} onClick={leavePreview}>Cancel import</button>
        <button type="button" disabled={importBusy} onClick={() => void confirmImport()}>
          {importBusy ? 'Importing...' : 'Confirm import'}
        </button>
      </div>
      {importError ? <p className="cw-error" role="alert">{importError}</p> : null}
    </div>
  ) : (
    <div className="cw-desk__transfer-actions">
      <div className="cw-button-row" role="group" aria-labelledby="cw-desk-transfer-heading">
        <button type="button" onClick={() => {
          try { downloadWeeklyProgress(progress, includeNotes); setImportError(null) }
          catch (error) { setImportError(error instanceof Error ? error.message : 'Progress could not be exported.') }
        }}>
          Export progress
        </button>
        {!readOnly && progressImportEnabled ? (
          <button ref={importButton} type="button" disabled={importBusy} onClick={() => importInput.current?.click()}>
            {importBusy ? 'Checking progress...' : 'Import progress'}
          </button>
        ) : null}
      </div>
      {importError ? <p className="cw-error" role="alert">{importError}</p> : null}
    </div>
  ) : undefined

  return (
    <CourtSheet
      className="cw-desk"
      title={candidateProgress ? 'Review imported progress' : 'Your working papers'}
      kicker={candidateProgress ? 'Before anything changes' : 'Private juror desk'}
      headingId="cw-desk-heading"
      closeLabel={candidateProgress ? 'Close import review' : 'Close juror desk'}
      closeDisabled={Boolean(candidateProgress && importBusy)}
      inactive={inactive}
      fallbackReturnFocusSelector={fallbackReturnFocusSelector}
      footer={transferActions}
      onClose={candidateProgress ? leavePreview : onClose}
    >
      {candidateProgress ? (
        <section className="cw-desk__import-preview" aria-labelledby="cw-import-preview-heading">
          <h3 id="cw-import-preview-heading" ref={previewHeading} tabIndex={-1}>Candidate summary</h3>
          <p>Nothing changes on this device until you confirm this import.</p>
          <dl>
            <div><dt>Case</dt><dd>{caseTitle} ({candidateProgress.courtWeekId})</dd></div>
            <div><dt>Revision</dt><dd>{candidateProgress.revision}</dd></div>
            <div><dt>Completed days</dt><dd>{completedDays.join(', ') || 'None'}</dd></div>
            <div><dt>Current phase</dt><dd>{currentPhase}</dd></div>
            <div><dt>Ballots</dt><dd>{ballots.length
              ? ballots.map(([label, verdict]) => `${label}: ${verdictLabels[verdict]}`).join('; ')
              : 'None saved'}</dd></div>
            <div><dt>Sealed result</dt><dd>{candidateProgress.sealedVerdict && candidateProgress.sealedAgreement
              ? `${verdictLabels[candidateProgress.sealedVerdict]} - ${candidateProgress.sealedAgreement}`
              : 'Not sealed'}</dd></div>
            <div><dt>Reasoning trail</dt><dd>{candidateProgress.reasoningContributions?.length ?? 0} saved</dd></div>
            <div><dt>Private notes</dt><dd>{candidateProgress.notes.length
              ? 'Included; replaces current notes'
              : 'Not included; current notes stay on this device'}</dd></div>
          </dl>
        </section>
      ) : <>
      <section>
        <h3>Court week</h3>
        <p><strong>Current phase:</strong> {phaseLabels[activePhase]}</p>
        <ol className="cw-desk__schedule">
          {sessions.map((session) => {
            const active = session.id === activeSessionId
            const completed = progress.completedSessionIds.includes(session.id)
            const status = active
              ? `${readOnly ? 'Replay' : 'Current'} · ${phaseLabels[activePhase]}`
              : completed ? 'Completed' : `Opens ${formatCourtUnlock(session.unlockAt)}`
            return <li key={session.id} aria-current={active ? 'step' : undefined}>
              <span><strong>{session.day}</strong> · {active || completed ? session.title : 'Sealed session'}</span>
              <small>{status}</small>
            </li>
          })}
        </ol>
      </section>

      <section>
        <h3>The charge</h3>
        <p>{trial.charge}. Plea: {trial.plea}.</p>
      </section>

      {duty ? <section>
        <h3>Section 41 duty</h3>
        <p><strong>{duty.title} — {duty.citation}</strong></p>
        <p>{duty.text}</p>
        <ol>{duty.elementQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
      </section> : null}

      <section>
        <h3>Charge questions</h3>
        {trial.offences.slice(0, 2).map((offence) => (
          <details key={offence.id}>
            <summary>{offence.title} — {offence.citation}</summary>
            <p>{offence.text}</p>
            <ol>{offence.elementQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
          </details>
        ))}
      </section>

      <section>
        <h3>Rulings and directions</h3>
        <p>Legal summaries only. Oral evidence is not stored as a searchable transcript.</p>
        <details>
          <summary>Directions recorded ({directions.length})</summary>
          {directions.length ? <ol>{directions.map((cue) => (
            <li key={authoredCueSourceId(cue)}>{cue.accessibleProposition}</li>
          ))}</ol> : <p>No judicial direction has yet been completed.</p>}
        </details>
        <details>
          <summary>Rulings recorded ({rulings.length})</summary>
          {rulings.length ? <ol>{rulings.map((cue) => (
            <li key={authoredCueSourceId(cue)}>{cue.accessibleProposition}</li>
          ))}</ol> : <p>No ruling has yet been completed.</p>}
        </details>
      </section>

      <section>
        <h3>Evidence ledger</h3>
        <p>Only material already put before the jury appears. Open its limits before relying on it.</p>
        <div className="cw-desk__evidence-list">
          {availableEvidence.map(({ evidence: item, state }) => <article key={item.id}>
            <div className="cw-desk__evidence-heading">
              {state === 'admitted' ? <button
                type="button"
                onClick={(event) => onInspectEvidence(item.id, event.currentTarget)}
              >{item.label}</button> : <strong>{item.label}</strong>}
              <small className="cw-desk__state">{state === 'admitted' ? 'Final admission' : 'Provisional'}</small>
            </div>
            {state === 'provisional' ? <p>Inspection and replay remain unavailable until final admission.</p> : null}
            <details>
              <summary>Permitted use and limitations</summary>
              <p><strong>Use only for:</strong> {item.allowedUses.join('; ')}.</p>
              <ul>{item.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
            </details>
          </article>)}
        </div>
        {!availableEvidence.length && !struckCount ? <p>No exhibit has yet been admitted.</p> : null}
        {struckCount ? <p className="cw-desk__struck"><strong>Struck — do not use.</strong>{' '}
          {struckCount} excluded {struckCount === 1 ? 'item has' : 'items have'} been removed from inspection and reasoning.
        </p> : null}
      </section>

      <section>
        <h3>Saved work</h3>
        <p><strong>{saveStatus}</strong></p>
        <p>{progress.notes.trim() ? 'Private notes are present.' : 'No private notes yet.'}{' '}
          {reasoning.length} evidence-linked {reasoning.length === 1 ? 'reason is' : 'reasons are'} saved.
        </p>
        {reasoning.length ? <details>
          <summary>Review saved reasoning ({reasoning.length})</summary>
          <ol>{reasoning.map((entry) => <li key={`${entry.sceneId}:${entry.recordedAt}`}>
            <strong>{reasoningMoveLabels[entry.move]}:</strong> {entry.legalQuestion}{' '}
            <small>Evidence: {trial.evidence.find(({ id }) => id === entry.evidenceId)?.label ?? 'admitted item'}</small>
          </li>)}</ol>
        </details> : null}
      </section>

      <section>
        <label htmlFor="cw-private-notes"><strong>Your private notes</strong></label>
        {readOnly ? (
          <p className="cw-kicker">Replay mode keeps notes and sealed ballots unchanged.</p>
        ) : null}
        <textarea
          id="cw-private-notes"
          rows={7}
          value={progress.notes}
          readOnly={readOnly}
          onChange={(event) => {
            if (!readOnly) onNotesChange(event.target.value)
          }}
          placeholder={progressTransferEnabled
            ? 'Your notes stay on this device unless you choose to export them.'
            : 'Temporary notes are discarded when you switch sessions or leave this session.'}
        />
      </section>

      {progressTransferEnabled ? <section className="cw-desk__transfer">
        <h3 id="cw-desk-transfer-heading">Move progress between devices</h3>
        {readOnly ? (
          <p>Import is unavailable during replay so sealed ballots stay intact. Export remains available.</p>
        ) : null}
        <label>
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(event) => setIncludeNotes(event.target.checked)}
          />
          Include my private notes in the export
        </label>
        {!readOnly && progressImportEnabled ? (
          <input
            ref={importInput}
            className="cw-visually-hidden"
            type="file"
            tabIndex={-1}
            accept="application/json,.json"
            onChange={(event) => void readImport(event.target.files?.[0])}
          />
        ) : null}
      </section> : null}
      </>}
    </CourtSheet>
  )
}
