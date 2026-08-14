import { useRef, useState } from 'react'
import { authoredCueSourceId } from '../content/captionPacing'
import { observedCourtCues, type EvidenceLedgerEntry } from '../engine/evidenceLedger'
import type {
  CourtEvent, CourtSession, DeliberationPack, LegalPhase, TrialRecord, WeeklyProgress,
} from '../model/schema'
import { reasoningMoveLabels } from '../model/deliberationContract'
import {
  downloadWeeklyProgress,
  importWeeklyProgress,
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

export interface JurorDeskProps {
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
  prepareImport?: (text: string) => Promise<WeeklyProgress>
  onImport: (progress: WeeklyProgress) => void
  progressTransferEnabled?: boolean
  progressImportEnabled?: boolean
  onInspectEvidence: (evidenceId: string, trigger: HTMLButtonElement) => void
  onClose: () => void
}

export function JurorDesk({
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
  const [includeNotes, setIncludeNotes] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
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

  const readImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      const imported = prepareImport
        ? await prepareImport(text)
        : importWeeklyProgress(
            text,
            progress.courtWeekId,
            progress.revision,
            deliberation,
            sessions,
          )
      onImport(imported)
      setImportError(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Progress could not be imported.')
    }
  }

  const transferActions = progressTransferEnabled ? (
    <div className="cw-desk__transfer-actions">
      <div className="cw-button-row" role="group" aria-labelledby="cw-desk-transfer-heading">
        <button type="button" onClick={() => downloadWeeklyProgress(progress, includeNotes)}>
          Export progress
        </button>
        {!readOnly && progressImportEnabled ? (
          <button type="button" onClick={() => importInput.current?.click()}>
            Import progress
          </button>
        ) : null}
      </div>
      {importError ? <p className="cw-error" role="alert">{importError}</p> : null}
    </div>
  ) : undefined

  return (
    <CourtSheet
      className="cw-desk"
      title="Your working papers"
      kicker="Private juror desk"
      headingId="cw-desk-heading"
      closeLabel="Close juror desk"
      inactive={inactive}
      fallbackReturnFocusSelector={fallbackReturnFocusSelector}
      footer={transferActions}
      onClose={onClose}
    >
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
    </CourtSheet>
  )
}
