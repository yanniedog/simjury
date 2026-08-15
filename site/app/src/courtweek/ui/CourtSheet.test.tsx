// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CourtSheet } from './CourtSheet'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('CourtSheet', () => {
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

  it('owns one focus loop, closes on Escape and restores its trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      const trigger = useRef<HTMLButtonElement>(null)
      return <>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>Open sheet</button>
        {open ? <CourtSheet
          title="Working papers"
          kicker="Juror desk"
          returnFocusTo={trigger.current}
          onClose={() => setOpen(false)}
          footer={<button type="button">Save changes</button>}
        >
          <button type="button">Body action</button>
        </CourtSheet> : null}
      </>
    }

    await act(async () => { root.render(<Harness />) })
    const trigger = host.querySelector<HTMLButtonElement>('button')!
    act(() => trigger.click())
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    const controls = dialog.querySelectorAll<HTMLButtonElement>('button')
    expect(document.activeElement).toBe(controls[0])
    expect(controls[0].getAttribute('aria-label')).toBe('Close sheet')

    controls[2].focus()
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(controls[0])
    controls[0].focus()
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(controls[2])

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await new Promise<void>((resolve) => queueMicrotask(resolve))
    })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('yields focus and modal ownership while inactive', async () => {
    const outside = document.createElement('button')
    document.body.prepend(outside)
    outside.focus()
    const onClose = vi.fn()
    const render = (inactive: boolean) => <CourtSheet
      title="Parent sheet"
      returnFocusTo={outside}
      inactive={inactive}
      onClose={onClose}
      footer={<button type="button">Finish</button>}
    ><p id="sheet-description">Scrollable content</p></CourtSheet>

    await act(async () => { root.render(render(true)) })
    const dialog = host.querySelector<HTMLElement>('.cw-sheet')!
    expect(dialog.hasAttribute('role')).toBe(false)
    expect(dialog.hasAttribute('inert')).toBe(true)
    expect(dialog.getAttribute('aria-hidden')).toBe('true')
    expect(dialog.hasAttribute('aria-modal')).toBe(false)
    expect(document.activeElement).toBe(outside)
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => { root.render(render(false)) })
    expect(dialog.hasAttribute('inert')).toBe(false)
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog.querySelector('.cw-sheet__close'))
    expect(dialog.querySelector('.cw-sheet__header')).not.toBeNull()
    expect(dialog.querySelector('.cw-sheet__body')).not.toBeNull()
    expect(dialog.querySelector('.cw-sheet__footer')).not.toBeNull()
    outside.remove()
  })

  it('can focus the first available control in its body', async () => {
    await act(async () => { root.render(<CourtSheet
      title="Required choice"
      initialFocusSelector=".cw-sheet__body button"
      onClose={() => undefined}
    >
      <button type="button" disabled>Unavailable</button>
      <button type="button">Oath</button>
    </CourtSheet>) })

    expect(document.activeElement?.textContent).toBe('Oath')
  })
})
