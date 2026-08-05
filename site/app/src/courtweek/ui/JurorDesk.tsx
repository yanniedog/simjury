import { useCallback, useEffect, useRef, useState } from 'react'
import type { CourtSession, DeliberationPack, TrialRecord, WeeklyProgress } from '../model/schema'
import {
  downloadWeeklyProgress,
  importWeeklyProgress,
} from '../state/progress'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
  const desk = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  onCloseRef.current = onClose

  const closeDesk = useCallback(() => {
    const target = returnFocusTo.current
    onCloseRef.current()
    queueMicrotask(() => {
      if (target?.isConnected) target.focus()
    })
  }, [])

  useEffect(() => {
    const root = desk.current
    if (!root) return
    const active = document.activeElement
    if (!returnFocusTo.current && active instanceof HTMLElement && !root.contains(active)) {
      returnFocusTo.current = active
    }
    root.querySelector<HTMLElement>(focusableSelector)?.focus()
    return () => {
      queueMicrotask(() => {
        if (!root.isConnected && returnFocusTo.current?.isConnected) {
          returnFocusTo.current.focus()
        }
      })
    }
  }, [])

  useEffect(() => {
    const root = desk.current
    if (!root || inactive) return
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeDesk()
        return
      }
      if (event.key !== 'Tab') return

      const available = focusable()
      const first = available[0]
      const last = available.at(-1)
      if (!first || !last) {
        event.preventDefault()
        root.focus()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keepFocusInDialog)
    return () => document.removeEventListener('keydown', keepFocusInDialog)
  }, [closeDesk, inactive])

  useEffect(() => {
    if (inactive) desk.current?.setAttribute('inert', '')
    else desk.current?.removeAttribute('inert')
  }, [inactive])

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

  return (
    <aside
      ref={desk}
      className="cw-desk"
      role="dialog"
      aria-modal={inactive ? undefined : 'true'}
      aria-labelledby="cw-desk-heading"
      tabIndex={-1}
    >
      <header className="cw-modal__header">
        <div>
          <p className="cw-kicker">Private juror desk</p>
          <h2 id="cw-desk-heading">Your working papers</h2>
        </div>
        <button type="button" onClick={closeDesk} aria-label="Close juror desk">Close</button>
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
            : 'Preview notes are discarded when you switch sessions or leave preview.'}
        />
      </section>

      {progressTransferEnabled ? <section className="cw-desk__transfer">
        <h3>Move progress between devices</h3>
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
        <div className="cw-button-row">
          <button type="button" onClick={() => downloadWeeklyProgress(progress, includeNotes)}>
            Export progress
          </button>
          {!readOnly ? (
            <button type="button" onClick={() => importInput.current?.click()}>
              Import progress
            </button>
          ) : null}
        </div>
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
        {importError ? <p className="cw-error" role="alert">{importError}</p> : null}
      </section> : null}
    </aside>
  )
}
