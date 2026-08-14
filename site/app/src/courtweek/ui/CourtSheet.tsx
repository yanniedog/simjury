import { useId, useRef, type ReactNode } from 'react'
import { useModalFocusBoundary } from './useModalFocusBoundary'

export interface CourtSheetProps {
  title: ReactNode
  children: ReactNode
  onClose: () => void
  kicker?: ReactNode
  footer?: ReactNode
  closeLabel?: string
  headingId?: string
  descriptionId?: string
  returnFocusTo?: HTMLElement | null
  fallbackReturnFocusSelector?: string
  inactive?: boolean
  className?: string
}

/** Responsive Court Week dialog surface. Its parent retains background ownership. */
export function CourtSheet({
  title,
  children,
  onClose,
  kicker,
  footer,
  closeLabel = 'Close sheet',
  headingId,
  descriptionId,
  returnFocusTo,
  fallbackReturnFocusSelector,
  inactive = false,
  className,
}: CourtSheetProps) {
  const generatedHeadingId = useId()
  const sheet = useRef<HTMLElement>(null)
  const labelledBy = headingId ?? `cw-sheet-${generatedHeadingId.replace(/:/gu, '')}`
  useModalFocusBoundary(sheet, returnFocusTo, fallbackReturnFocusSelector, {
    active: !inactive,
    onEscape: onClose,
  })

  return (
    <section
      ref={sheet}
      className={['cw-sheet', className].filter(Boolean).join(' ')}
      role={inactive ? undefined : 'dialog'}
      aria-modal={inactive ? undefined : 'true'}
      aria-hidden={inactive || undefined}
      aria-labelledby={labelledBy}
      aria-describedby={descriptionId}
      tabIndex={-1}
      {...(inactive ? { inert: '' } : {})}
    >
      <header className="cw-sheet__header">
        <div className="cw-sheet__header-copy">
          {kicker ? <p className="cw-kicker">{kicker}</p> : null}
          <h2 id={labelledBy}>{title}</h2>
        </div>
        <button className="cw-sheet__close" type="button" onClick={onClose} aria-label={closeLabel}>
          Close
        </button>
      </header>
      <div className="cw-sheet__body">{children}</div>
      {footer ? <footer className="cw-sheet__footer">{footer}</footer> : null}
    </section>
  )
}
