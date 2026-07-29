// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { ensureNpcNotes, recollectionStub, upsertPlayerNote } from '../../lib/jurorNotes'
import {
  phaseNarratorCue,
  REASONABLE_DOUBT_DIRECTION,
} from '../../lib/narratorCues'
import type { Outcome } from '../../engine/deliberation'
import { JuryRoomView } from './JuryRoomView'
import type { Verdict } from './DocketVerdict'

vi.mock('../../lib/narration', () => ({
  speak: vi.fn(),
  speakAll: vi.fn(),
  stopSpeech: vi.fn(),
}))

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(text),
  )
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function mountJuryRoom(onSeal = vi.fn()) {
  const trial = makeDocketCase()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={[]}
        onSeal={onSeal}
        onDone={() => undefined}
      />,
    )
  })
  return { trial, container, root, onSeal }
}

function advanceToFinalVote(container: ParentNode) {
  act(() => {
    buttonByText(container, 'Hear first point').click()
  })
  act(() => {
    buttonByText(container, 'Continue to next point').click()
  })
  act(() => {
    buttonByText(container, 'Hear final point').click()
  })
  expect(container.textContent).toContain('Lock your position')
}

function sealVerdict(
  container: ParentNode,
  verdictLabel: string,
  reflectionValue?: string,
) {
  act(() => {
    buttonByText(container, verdictLabel).click()
  })
  if (reflectionValue !== undefined) {
    const select = container.querySelector('select')
    if (!select) throw new Error('Reflection select not found')
    act(() => {
      select.value = reflectionValue
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  act(() => {
    buttonByText(container, 'Tap again to seal').click()
  })
}

describe('JuryRoomView', () => {
  it('keeps deliberation on notes and memory — never quotes beat text', () => {
    const trial = makeDocketCase()
    const notes = ensureNpcNotes(
      trial,
      upsertPlayerNote([], trial.beats[0].id, 'Witness sounded unsure on the time.'),
    )
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={notes}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Reload notes')
    expect(markup).toContain('Discuss from notes and memory')
    expect(markup).not.toContain(trial.beats[0].text)
    expect(markup).not.toContain('Choose evidence, then argue')
  })

  it('keeps the sealed room free of analysis and transcript spoilers', () => {
    const trial = makeDocketCase()
    const notes = upsertPlayerNote([], trial.beats[0].id, 'ID felt soft under pressure.')
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={notes}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Reload notes')
    expect(markup).not.toContain(trial.reference_verdict)
    expect(markup).not.toContain('misleading')
    expect(markup).not.toContain(trial.beats[0].reveal_note)
    expect(markup).not.toContain(trial.beats[0].text)
  })

  it('makes narration-off deliberation explicitly user-paced', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={[]}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Hear first point')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-atomic="true"')
    expect(markup).not.toContain('>Pause<')
  })

  it('keeps sealing available without forcing a reflection choice in the initial room', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={[]}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).not.toContain('Optional · strongest challenge')
    expect(markup).not.toContain(trial.reference_verdict)
  })

  it('keeps speech playback controls when narration is on', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration
        playbackRate={1}
        notes={[]}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('>Pause<')
    expect(markup).not.toContain('Hear first point')
  })

  it('explains the staged room without presenting it as legal doctrine', () => {
    const cue = phaseNarratorCue('juryroom')

    expect(cue).toContain('three focused rounds')
    expect(cue).toContain('pause, reopen written notes, or raise a point')
    expect(cue).toContain('choose a verdict or remain undecided')
    expect(cue).toContain('Eleven matching votes')
    expect(cue).toContain('undecided jurors remain undecided')
    expect(cue).not.toMatch(/\blawful\b|\blegally required\b/i)
  })

  it('uses the complete reasonable-doubt direction', () => {
    expect(REASONABLE_DOUBT_DIRECTION).toBe(
      'If, after considering all the evidence, you are not sure the prosecution proved every element beyond reasonable doubt, your verdict must be Not Guilty.',
    )
    expect(phaseNarratorCue('verdict')).toBe(REASONABLE_DOUBT_DIRECTION)
  })
})

describe('JuryRoomView verdict sealing', () => {
  let roots: Root[] = []

  beforeEach(() => {
    roots = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    for (const root of roots) {
      act(() => {
        root.unmount()
      })
    }
    document.body.innerHTML = ''
  })

  function trackRoot(root: Root) {
    roots.push(root)
    return root
  }

  it('reaches final vote and seals with skip, no single point, and a selected beat', () => {
    const skipSeal = vi.fn()
    const noneSeal = vi.fn()
    const beatSeal = vi.fn()
    const skip = mountJuryRoom(skipSeal)
    trackRoot(skip.root)
    advanceToFinalVote(skip.container)
    sealVerdict(skip.container, 'Not persuaded to convict')
    expect(skipSeal).toHaveBeenCalledTimes(1)
    expect(skipSeal.mock.calls[0]?.[2]).toBeUndefined()

    const none = mountJuryRoom(noneSeal)
    trackRoot(none.root)
    advanceToFinalVote(none.container)
    sealVerdict(none.container, 'Not persuaded to convict', '__none__')
    expect(noneSeal).toHaveBeenCalledTimes(1)
    expect(noneSeal.mock.calls[0]?.[2]).toEqual({})

    const beat = mountJuryRoom(beatSeal)
    trackRoot(beat.root)
    advanceToFinalVote(beat.container)
    sealVerdict(beat.container, 'Not persuaded to convict', beat.trial.beats[0].id)
    expect(beatSeal).toHaveBeenCalledTimes(1)
    expect(beatSeal.mock.calls[0]?.[2]).toEqual({
      counterargumentBeatId: beat.trial.beats[0].id,
    })

    for (const [fn, verdict] of [
      [skipSeal, 'Not Guilty'],
      [noneSeal, 'Not Guilty'],
      [beatSeal, 'Not Guilty'],
    ] as const) {
      const [outcome, sealedVerdict] = fn.mock.calls[0] as [Outcome, Verdict]
      expect(outcome).toBeTruthy()
      expect(sealedVerdict).toBe(verdict)
    }
  })
})

describe('juror note stubs', () => {
  it('build recollection stubs without copying primary text', () => {
    const trial = makeDocketCase()
    const beat = trial.beats[0]
    const juror = trial.jury.jurors[0]
    const stub = recollectionStub(trial, beat, juror)
    expect(stub.length).toBeGreaterThan(0)
    expect(stub.includes(beat.text)).toBe(false)
  })
})
