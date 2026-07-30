// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { MOVE_LABEL } from '../../lib/moveCopy'
import { JuryRoomView } from './JuryRoomView'

vi.mock('../../lib/narration', () => ({
  speak: vi.fn(),
  speakAll: vi.fn(),
  stopSpeech: vi.fn(),
}))

/**
 * Drives the real room the way a player does: open the composer, choose a
 * technique, put it to the room, and read what came back. This is the
 * end-to-end check that the persuasion layer reaches the screen — the engine
 * tests prove the model, and this proves it is actually wired to a button.
 */

function click(container: ParentNode, text: string) {
  const button = [...container.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(text),
  )
  if (!button) throw new Error(`Button not found: ${text}`)
  act(() => {
    button.click()
  })
}

function type(container: ParentNode, selector: string, value: string) {
  const field = container.querySelector<HTMLTextAreaElement>(selector)
  if (!field) throw new Error(`Field not found: ${selector}`)
  // Assigning `.value` directly also updates React's internal value tracker,
  // so onChange never fires. Go through the prototype setter instead.
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  if (!setValue) throw new Error('No textarea value setter')
  act(() => {
    setValue.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('raising a point in the jury room', () => {
  let roots: Root[] = []

  beforeEach(() => {
    roots = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots) act(() => root.unmount())
    document.body.innerHTML = ''
  })

  function mount() {
    const trial = makeDocketCase()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    act(() => {
      root.render(
        <JuryRoomView
          trial={trial}
          narration={false}
          playbackRate={1}
          notes={[]}
          onSeal={() => undefined}
          onDone={() => undefined}
        />,
      )
    })
    return { trial, container }
  }

  it('offers techniques in the composer and reads the room back after one lands', () => {
    const { container } = mount()

    click(container, 'Raise an issue')
    expect(container.textContent).toContain('Raise a point')
    expect(container.textContent).toContain(MOVE_LABEL.challenge_inference)

    type(container, '.composer-textarea', 'The identity evidence does not prove who held it.')
    click(container, MOVE_LABEL.challenge_inference)
    click(container, 'Put it to the room')

    const read = container.querySelector('.room-read')
    expect(read).toBeTruthy()
    expect(read!.textContent).toBeTruthy()
    // Engagement only: the read must never disclose a leaning or a tally.
    expect(read!.textContent).not.toMatch(/guilty|not guilty|undecided/i)
  })

  it('asks which recollection an unclear concern meant, then accepts it anyway', () => {
    const { container } = mount()

    click(container, 'Raise an issue')
    type(container, '.composer-textarea', 'The log shows the device, not who held it.')
    click(container, 'Put it to the room')

    // The room could not place it, so it asks rather than guessing.
    expect(container.querySelector('.composer-feedback')).toBeTruthy()
    expect(container.querySelector('.room-read')).toBeNull()

    click(container, 'anyway')
    expect(container.querySelector('.room-read')).toBeTruthy()
  })

  it('refuses to send an empty concern', () => {
    const { container } = mount()

    click(container, 'Raise an issue')
    click(container, 'Put it to the room')

    expect(container.textContent).toContain('Put your concern in your own words first')
    expect(container.querySelector('.room-read')).toBeNull()
  })

  it('opens a juror dossier from their seat without revealing a position', () => {
    const { trial, container } = mount()

    const seat = container.querySelector<HTMLButtonElement>('.jury-seat.interactive')
    expect(seat).toBeTruthy()
    act(() => seat!.click())

    const panel = container.querySelector('.dossier-panel-wrap')
    expect(panel).toBeTruthy()
    expect(panel!.textContent).toContain('Where you stand')
    expect(panel!.textContent).toContain(trial.jury.jurors[0].persona)
    expect(panel!.textContent).not.toMatch(/\bguilty\b|\bnot guilty\b/i)
  })

  it('keeps the room reachable through the dossier toggle too', () => {
    const { container } = mount()

    click(container, 'Know the room')
    expect(container.querySelector('.dossier-panel-wrap')).toBeTruthy()
    click(container, 'Hide the room')
    expect(container.querySelector('.dossier-panel-wrap')).toBeNull()
  })
})
