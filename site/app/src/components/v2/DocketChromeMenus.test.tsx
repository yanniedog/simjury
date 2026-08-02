// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocketShell } from './DocketChrome'

/**
 * The rewind confirm, driven the way a player drives it.
 *
 * Rewind clears the sitting's progress and notes and cannot be undone. It used
 * to sit in a permanent banner above every phase as a single unconfirmed
 * click. The SSR tests prove it is no longer on the page by default; this
 * proves the confirm step actually gates the call.
 */

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
  vi.restoreAllMocks()
})

function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(text),
  )
  if (!button) throw new Error(`Button not found: ${text}`)
  act(() => button.click())
}

function renderShell(onRewind: () => void) {
  act(() => {
    root.render(
      <DocketShell
        phase="beats"
        caseTitle="The Quiet Platform"
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
        onRewind={onRewind}
      >
        <h1 id="phase-heading">Evidence</h1>
      </DocketShell>,
    )
  })
}

describe('the sitting overflow menu', () => {
  it('does not clear the sitting until the warning has been accepted', () => {
    const rewind = vi.fn()
    renderShell(rewind)

    click('Rewind to beginning')
    expect(rewind).not.toHaveBeenCalled()
    expect(host.textContent).toContain('cannot be undone')

    click('Yes, rewind and clear')
    expect(rewind).toHaveBeenCalledTimes(1)
  })

  it('lets the player back out, leaving the sitting untouched', () => {
    const rewind = vi.fn()
    renderShell(rewind)

    click('Rewind to beginning')
    click('Keep my progress')

    expect(rewind).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('cannot be undone')
    // Back to the single, safe entry point.
    expect(host.textContent).toContain('Rewind to beginning')
  })

  it('re-arms the confirm when the menu is closed and reopened', () => {
    const rewind = vi.fn()
    renderShell(rewind)

    click('Rewind to beginning')
    expect(host.textContent).toContain('cannot be undone')

    const menu = host.querySelector<HTMLDetailsElement>('.sitting-menu')!
    act(() => {
      menu.open = false
      menu.dispatchEvent(new Event('toggle'))
    })

    expect(host.textContent).not.toContain('cannot be undone')
    expect(rewind).not.toHaveBeenCalled()
  })
})
