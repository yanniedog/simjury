// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRef } from 'react'
import { useModalFocusBoundary } from './useModalFocusBoundary'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function TestDialog({ controlsEnabled = true }: { controlsEnabled?: boolean }) {
  const dialog = useRef<HTMLElement>(null)
  useModalFocusBoundary(dialog)
  return (
    <section ref={dialog} role="dialog" tabIndex={-1}>
      <button disabled={!controlsEnabled}>First</button><button disabled={!controlsEnabled}>Last</button>
    </section>
  )
}

describe('useModalFocusBoundary', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('moves focus inside, wraps both Tab directions and restores the trigger', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.prepend(trigger)
    trigger.focus()
    await act(async () => { root.render(<TestDialog />) })
    const buttons = host.querySelectorAll('button')
    expect(document.activeElement).toBe(buttons[0])
    buttons[1].focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[0])
    buttons[0].focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[1])

    act(() => root.unmount())
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(document.activeElement).toBe(trigger)
    root = createRoot(host)
    trigger.remove()
  })

  it('enters newly enabled controls from a dialog initially focused as its fallback', async () => {
    await act(async () => { root.render(<TestDialog controlsEnabled={false} />) })
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    expect(document.activeElement).toBe(dialog)
    await act(async () => { root.render(<TestDialog controlsEnabled />) })
    const buttons = host.querySelectorAll('button')
    dialog.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[0])

    dialog.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[1])
  })

  it('returns focus to the named fallback control, not the first one in document order', async () => {
    const controls = document.createElement('nav')
    controls.className = 'cw-controls'
    controls.innerHTML = '<button type="button">Play</button>'
      + '<button type="button" class="cw-controls__advance">Continue</button>'
    document.body.append(controls)
    // The court shell removes Continue while a mandatory dialog is open, so the
    // dialog closes with its trigger gone and must fall back to the advance
    // control rather than restarting playback.
    const trigger = document.createElement('button')
    document.body.prepend(trigger)
    trigger.focus()

    function FallbackDialog() {
      const dialog = useRef<HTMLElement>(null)
      useModalFocusBoundary(dialog, trigger, '.cw-controls__advance, .cw-controls button:not([disabled])')
      return (
        <section ref={dialog} role="dialog" tabIndex={-1}>
          <button type="button">Continue proceedings</button>
        </section>
      )
    }
    await act(async () => { root.render(<FallbackDialog />) })
    trigger.remove()

    act(() => root.unmount())
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(document.activeElement).toBe(controls.querySelector('.cw-controls__advance'))
    root = createRoot(host)
    controls.remove()
  })

  it('skips controls removed from the active focus order', async () => {
    function AvailabilityDialog() {
      const dialog = useRef<HTMLElement>(null)
      useModalFocusBoundary(dialog)
      return (
        <section ref={dialog} role="dialog" tabIndex={-1}>
          <div hidden><button type="button">Hidden by ancestor</button></div>
          <button type="button" tabIndex={-1}>Programmatic only</button>
          <fieldset disabled><button type="button">Disabled by fieldset</button></fieldset>
          <button type="button">Available</button>
        </section>
      )
    }
    await act(async () => { root.render(<AvailabilityDialog />) })
    expect(document.activeElement?.textContent).toBe('Available')
  })
})
