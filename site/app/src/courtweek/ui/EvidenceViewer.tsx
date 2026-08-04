import { useEffect, useRef, useState } from 'react'
import type { EvidenceItem } from '../model/schema'
import { renderExhibitPresentation } from './evidencePresentation'

export interface EvidenceViewerProps {
  evidence: EvidenceItem
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

export function EvidenceViewer({ evidence, returnFocusTo, onClose }: EvidenceViewerProps) {
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
          ) : <p>{evidence.accessibleProposition}</p>}
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
    </section>
  )
}
