import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'summary:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isAvailable(element: HTMLElement, root: HTMLElement): boolean {
  if (element.matches(':disabled')) return false
  for (let current: HTMLElement | null = element; current && root.contains(current); current = current.parentElement) {
    if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') return false
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

function availableControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => isAvailable(element, root))
}

/**
 * Resolves a comma-separated fallback list in the caller's order of preference.
 * `querySelector` with one grouped selector answers in document order instead,
 * which returned focus to the first playback control rather than the named
 * advance control after a mandatory dialog closed.
 */
function firstMatch(selectorList?: string): HTMLElement | null {
  if (!selectorList) return null
  for (const selector of selectorList.split(',')) {
    const candidate = document.querySelector<HTMLElement>(selector.trim())
    if (candidate) return candidate
  }
  return null
}

export interface ModalFocusBoundaryOptions {
  active?: boolean
  initialFocusSelector?: string
  onEscape?: () => void
}

/** Keeps keyboard focus inside one active modal and restores its opening control. */
export function useModalFocusBoundary(
  rootRef: RefObject<HTMLElement>,
  preferredReturnFocus?: HTMLElement | null,
  fallbackReturnFocusSelector?: string,
  { active = true, initialFocusSelector, onEscape }: ModalFocusBoundaryOptions = {},
): void {
  const onEscapeRef = useRef(onEscape)
  const returnFocusRef = useRef<HTMLElement | null>()
  onEscapeRef.current = onEscape

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const activeBeforeOpen = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const preferred = preferredReturnFocus && preferredReturnFocus !== document.body
      ? preferredReturnFocus
      : null
    if (preferred && !returnFocusRef.current?.isConnected) {
      returnFocusRef.current = preferred
    } else if (returnFocusRef.current === undefined) {
      returnFocusRef.current = activeBeforeOpen === document.body ? null : activeBeforeOpen
    }

    if (active && !root.contains(document.activeElement)) {
      const available = availableControls(root)
      const requested = initialFocusSelector
        ? available.find((element) => element.matches(initialFocusSelector))
        : undefined
      ;(requested ?? available[0] ?? root).focus()
    }

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const available = availableControls(root)
      const first = available[0]
      const last = available.at(-1)
      if (!first || !last) {
        event.preventDefault()
        root.focus()
        return
      }
      const active = document.activeElement
      if (event.shiftKey && (active === root || active === first || !root.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === root || active === last || !root.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    if (active) document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.removeEventListener('keydown', keepFocusInside)
      queueMicrotask(() => {
        if (root.isConnected) return
        const target = returnFocusRef.current?.isConnected
          ? returnFocusRef.current
          : firstMatch(fallbackReturnFocusSelector)
        target?.focus()
      })
    }
  }, [active, fallbackReturnFocusSelector, initialFocusSelector, preferredReturnFocus, rootRef])
}
