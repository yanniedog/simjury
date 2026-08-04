import { useEffect, useRef, useState } from 'react'
import { useCuePlayback } from '../media/useCuePlayback'
import type { EvidenceItem, SceneCue } from '../model/schema'
import { renderExhibitPresentation } from './evidencePresentation'

export interface EvidenceViewerProps {
  evidence: EvidenceItem
  recordingCues?: SceneCue[]
  showRecordingCaptions?: boolean
  expandRecordingCaptions?: boolean
  returnFocusTo?: HTMLElement | null
  onClose: () => void
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function RecordingReplay({
  cues,
  showCaptions = false,
  expandCaptions = false,
}: {
  cues: SceneCue[]
  showCaptions?: boolean
  expandCaptions?: boolean
}) {
  const [cueIndex, setCueIndex] = useState(0)
  const [continueOnCueChange, setContinueOnCueChange] = useState(false)
  const [completed, setCompleted] = useState(false)
  const cue = cues[cueIndex]
  const playback = useCuePlayback(cue, () => {
    if (cueIndex + 1 < cues.length) {
      setContinueOnCueChange(true)
      setCueIndex((index) => index + 1)
    } else {
      setCompleted(true)
    }
  }, undefined, { deferSourceUntilPlay: true })
  const playRecording = playback.play
  useEffect(() => {
    if (!continueOnCueChange) return
    setContinueOnCueChange(false)
    void playRecording()
  }, [continueOnCueChange, cueIndex, playRecording])
  const activeTurn = cue.turns?.find((turn) => turn.id === playback.activeTurnId)
  const caption = playback.status === 'reading-fallback'
    ? { speaker: cue.speaker, text: cues.map((item) => item.text).join(' ') }
    : activeTurn ?? { speaker: cue.speaker, text: cue.accessibleProposition }
  const active = playback.status === 'playing' || playback.status === 'speech-fallback' || playback.status === 'loading'
  const presentingCaption = active || playback.status === 'paused' || playback.status === 'reading-fallback'
  const captionsVisible = showCaptions || playback.status === 'speech-fallback' || playback.status === 'reading-fallback'
  const label = active
    ? 'Pause admitted recording'
    : playback.status === 'paused' && !completed
      ? 'Resume admitted recording'
      : 'Replay admitted recording'

  return (
    <section className="cw-recording-replay" aria-labelledby="cw-recording-replay-heading">
      <h3 id="cw-recording-replay-heading">Admitted recording</h3>
      <p id="cw-recording-replay-direction">
        You may replay this exhibit. Repetition does not give it extra legal weight; use only what is actually audible and keep its stated limitations in mind.
      </p>
      <button
        type="button"
        aria-describedby="cw-recording-replay-direction"
        onClick={() => {
          if (active) playback.pause()
          else if (playback.status === 'paused' && !completed) void playback.play()
          else {
            setCompleted(false)
            if (cueIndex === 0) void playback.repeat()
            else {
              setContinueOnCueChange(true)
              setCueIndex(0)
            }
          }
        }}
      >
        {label}
      </button>
      {captionsVisible && presentingCaption ? (
        <p className="cw-recording-caption" data-expanded={expandCaptions || playback.status === 'reading-fallback' || undefined} aria-hidden="true">
          <strong>{caption.speaker}</strong> {caption.text}
        </p>
      ) : null}
      <p className="cw-visually-hidden" aria-live="polite" aria-atomic="true">
        {presentingCaption ? `${caption.speaker}. ${caption.text}` : ''}
      </p>
      {playback.error ? <p className="cw-error" role="status">{playback.error}</p> : null}
    </section>
  )
}

export function EvidenceViewer({ evidence, recordingCues, showRecordingCaptions, expandRecordingCaptions, returnFocusTo, onClose }: EvidenceViewerProps) {
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dialog = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const root = dialog.current
    if (!root) return

    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
    const initialFocus = focusable()[0] ?? root
    initialFocus.focus()

    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
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
    return () => {
      document.removeEventListener('keydown', keepFocusInDialog)
      queueMicrotask(() => {
        if (!root.isConnected && returnFocusTo?.isConnected) returnFocusTo.focus()
      })
    }
  }, [returnFocusTo])

  const move = (x: number, y: number) =>
    setOffset((current) => ({ x: current.x + x, y: current.y + y }))
  const reset = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }
  const presentation = evidence.status === 'admitted' ? evidence.presentation : undefined

  if (evidence.status !== 'admitted') {
    return (
      <section ref={dialog} className="cw-modal cw-evidence-viewer" role="dialog" aria-modal="true" aria-labelledby="cw-evidence-unavailable" tabIndex={-1}>
        <header className="cw-modal__header">
          <div>
            <p className="cw-kicker">Juror desk</p>
            <h2 id="cw-evidence-unavailable">Exhibit unavailable</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close exhibit">Close</button>
        </header>
        <p>Only admitted exhibits can be inspected.</p>
      </section>
    )
  }

  return (
    <section
      ref={dialog}
      className="cw-modal cw-evidence-viewer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-evidence-heading"
      tabIndex={-1}
    >
      <header className="cw-modal__header">
        <div>
          <p className="cw-kicker">Admitted exhibit</p>
          <h2 id="cw-evidence-heading">{evidence.label}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close exhibit">
          Close
        </button>
      </header>

      <div className="cw-evidence-tools" aria-label="Exhibit viewing controls">
        <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.2))}>
          Zoom in
        </button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.8, value - 0.2))}>
          Zoom out
        </button>
        <button type="button" onClick={() => move(-24, 0)} aria-label="Move exhibit left">←</button>
        <button type="button" onClick={() => move(24, 0)} aria-label="Move exhibit right">→</button>
        <button type="button" onClick={() => move(0, -24)} aria-label="Move exhibit up">↑</button>
        <button type="button" onClick={() => move(0, 24)} aria-label="Move exhibit down">↓</button>
        <button type="button" onClick={reset}>Reset</button>
      </div>

      <div className="cw-evidence-canvas">
        <article
          className="cw-evidence-document"
          data-inspection-source={presentation?.kind === 'route' ? 'structured-vector' : 'structured-document'}
          data-visual-fallback={presentation ? undefined : 'neutral'}
          {...(presentation ? {
            role: 'group',
            'aria-describedby': `cw-evidence-ambiguity-${evidence.id}`,
          } : {})}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        >
          {presentation ? (
            renderExhibitPresentation(presentation)
          ) : (
            <div className="cw-evidence-neutral">
              <p>A visual facsimile is unavailable. The admitted proposition remains available.</p>
              <p>{evidence.accessibleProposition}</p>
            </div>
          )}
          {presentation ? (
            <p id={`cw-evidence-ambiguity-${evidence.id}`} className="cw-evidence-ambiguity">
              {presentation.ambiguity}
            </p>
          ) : null}
        </article>
      </div>

      <details className="cw-evidence-foundation">
        <summary>Evidence foundation</summary>
        <dl>
          <dt>Provenance</dt><dd>{evidence.provenance}</dd>
          <dt>Authentication</dt><dd>{evidence.authentication}</dd>
          <dt>Integrity</dt><dd>{evidence.integrity}</dd>
          <dt>Admitted through</dt><dd>{evidence.admittedThrough}</dd>
        </dl>
      </details>

      <div className="cw-evidence-limits">
        <h3>How you may use it</h3>
        <ul>{evidence.allowedUses.map((use) => <li key={use}>{use}</li>)}</ul>
        <h3>Limitations</h3>
        <ul>{evidence.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </div>

      {evidence.kind === 'recording' && recordingCues?.length ? (
        <RecordingReplay cues={recordingCues} showCaptions={showRecordingCaptions} expandCaptions={expandRecordingCaptions} />
      ) : null}
    </section>
  )
}
