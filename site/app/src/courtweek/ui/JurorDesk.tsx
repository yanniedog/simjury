import { useRef, useState } from 'react'
import type { TrialRecord, WeeklyProgress } from '../model/schema'
import {
  downloadWeeklyProgress,
  importWeeklyProgress,
} from '../state/progress'

export interface JurorDeskProps {
  trial: TrialRecord
  progress: WeeklyProgress
  onNotesChange: (notes: string) => void
  onImport: (progress: WeeklyProgress) => void
  onInspectEvidence: (evidenceId: string) => void
  onClose: () => void
}

export function JurorDesk({
  trial,
  progress,
  onNotesChange,
  onImport,
  onInspectEvidence,
  onClose,
}: JurorDeskProps) {
  const importInput = useRef<HTMLInputElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const readImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const imported = importWeeklyProgress(
        await file.text(),
        progress.courtWeekId,
        progress.revision,
      )
      onImport(imported)
      setImportError(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Progress could not be imported.')
    }
  }

  return (
    <aside
      className="cw-desk"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-desk-heading"
    >
      <header className="cw-modal__header">
        <div>
          <p className="cw-kicker">Private juror desk</p>
          <h2 id="cw-desk-heading">Your working papers</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close juror desk">Close</button>
      </header>

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
            <button key={item.id} type="button" onClick={() => onInspectEvidence(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label htmlFor="cw-private-notes"><strong>Your private notes</strong></label>
        <textarea
          id="cw-private-notes"
          rows={7}
          value={progress.notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Your notes stay on this device unless you choose to export them."
        />
      </section>

      <section className="cw-desk__transfer">
        <h3>Move progress between devices</h3>
        <label>
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(event) => setIncludeNotes(event.target.checked)}
          />
          Include my private notes in the export
        </label>
        <div className="cw-button-row">
          <button type="button" onClick={() => downloadWeeklyProgress(progress, includeNotes)}>
            Export progress
          </button>
          <button type="button" onClick={() => importInput.current?.click()}>
            Import progress
          </button>
        </div>
        <input
          ref={importInput}
          className="cw-visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void readImport(event.target.files?.[0])}
        />
        {importError ? <p className="cw-error" role="alert">{importError}</p> : null}
      </section>
    </aside>
  )
}
