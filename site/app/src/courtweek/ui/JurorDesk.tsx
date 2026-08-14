import { useRef, useState } from 'react'
import type { CourtSession, DeliberationPack, TrialRecord, WeeklyProgress } from '../model/schema'
import {
  downloadWeeklyProgress,
  importWeeklyProgress,
} from '../state/progress'
import { CourtSheet } from './CourtSheet'

export interface JurorDeskProps {
  trial: TrialRecord
  sessions: CourtSession[]
  deliberation?: DeliberationPack
  progress: WeeklyProgress
  readOnly?: boolean
  inactive?: boolean
  onNotesChange: (notes: string) => void
  prepareImport?: (text: string) => Promise<WeeklyProgress>
  onImport: (progress: WeeklyProgress) => void
  progressTransferEnabled?: boolean
  onInspectEvidence: (evidenceId: string, trigger: HTMLButtonElement) => void
  onClose: () => void
}

export function JurorDesk({
  trial,
  sessions,
  deliberation,
  progress,
  readOnly = false,
  inactive = false,
  onNotesChange,
  prepareImport,
  onImport,
  progressTransferEnabled = true,
  onInspectEvidence,
  onClose,
}: JurorDeskProps) {
  const importInput = useRef<HTMLInputElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

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
        {!readOnly ? (
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
      footer={transferActions}
      onClose={onClose}
    >
      <section>
        <h3>The charge</h3>
        <p>{trial.charge}. Plea: {trial.plea}.</p>
      </section>

      <section>
        <h3>Questions of law</h3>
        {trial.offences.slice(0, 2).map((offence) => (
          <details key={offence.id}>
            <summary>{offence.title} — {offence.citation}</summary>
            <p>{offence.text}</p>
            <ol>{offence.elementQuestions.map((question) => <li key={question}>{question}</li>)}</ol>
          </details>
        ))}
      </section>

      <section>
        <h3>Admitted exhibits</h3>
        <div className="cw-desk__evidence-list">
          {trial.evidence.filter((item) => item.status === 'admitted').map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => onInspectEvidence(item.id, event.currentTarget)}
            >
              {item.label}
            </button>
          ))}
        </div>
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
        {!readOnly ? (
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
