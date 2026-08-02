// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'

const narrationMocks = vi.hoisted(() => ({
  speak: vi.fn(),
  speakAll: vi.fn(),
  stopSpeech: vi.fn(),
}))

vi.mock('../../lib/narration', () => narrationMocks)

import { DocketBeatView } from './DocketBeatView'

afterEach(() => {
  document.body.textContent = ''
  vi.clearAllMocks()
})

describe('DocketBeatView narration highlighting', () => {
  it('highlights a one-turn transcript when it is the only spoken line', () => {
    const trial = makeDocketCase()
    for (const [index, text] of ['First answer.', 'Second answer.'].entries()) {
      Object.assign(trial.beats[index], {
        kind: 'witness' as const,
        mode: 'examination' as const,
        speaker: 'w1',
        text,
        turns: [{ speaker: 'w1', text }],
      })
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const renderBeat = (beatIndex: number) => (
      <DocketBeatView
        trial={trial}
        beatIndex={beatIndex}
        narration={true}
        playbackRate={1}
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />
    )

    act(() => root.render(renderBeat(0)))
    act(() => root.render(renderBeat(1)))

    expect(narrationMocks.speak).toHaveBeenLastCalledWith(
      'Second answer.',
      'w1',
      expect.any(Function),
      1,
    )
    const active = container.querySelector('[aria-current="true"]')
    expect(active).not.toBeNull()
    expect(active?.textContent).toContain('Second answer.')

    act(() => root.unmount())
  })
})
