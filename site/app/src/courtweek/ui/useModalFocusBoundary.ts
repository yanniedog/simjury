import { useEffect, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function availableControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
}

/** Keeps a mandatory modal's keyboard focus inside it without making Escape an exit. */
export function useModalFocusBoundary(
  rootRef: RefObject<HTMLElement>,
  preferredReturnFocus?: HTMLElement | null,
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const activeBeforeOpen = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const returnFocusTo = preferredReturnFocus && preferredReturnFocus !== document.body
      ? preferredReturnFocus
      : activeBeforeOpen

    ;(availableControls(root)[0] ?? root).focus()

    const keepFocusInside = (event: KeyboardEvent) => {
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

    document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.removeEventListener('keydown', keepFocusInside)
      queueMicrotask(() => {
        if (root.isConnected) return
        const target = returnFocusTo?.isConnected
          ? returnFocusTo
          : document.querySelector<HTMLElement>('.cw-controls__advance, .cw-controls button:not([disabled])')
        target?.focus()
      })
    }
  }, [preferredReturnFocus, rootRef])
}
