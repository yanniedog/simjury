// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneCue } from '../model/schema'
import { useCuePlayback } from './useCuePlayback'

const cue: SceneCue = {
  id: 'cue-audio',
  event: 'witness-chief',
  speaker: 'Witness',
  text: 'The beacon was correct.',
  accessibleProposition: 'The witness says the beacon was correct.',
  tone: 'chief',
  evidenceIds: [],
  replayable: false,
  audio: {
    opus: 'https://example.test/cue.opus',
    mp3: 'https://example.test/cue.mp3',
  },
}

class MockAudio extends EventTarget {
  static latest: MockAudio
  src = ''
  preload = ''
  currentTime = 0
  ended = false
  play = vi.fn(async () => this.dispatchEvent(new Event('playing')))
  pause = vi.fn(() => this.dispatchEvent(new Event('pause')))
  load = vi.fn()
  constructor() {
    super()
    MockAudio.latest = this
  }
  canPlayType(type: string) { return type.includes('opus') ? 'probably' : '' }
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
}

function Harness({ onEnded }: { onEnded: () => void }) {
  const playback = useCuePlayback(cue, onEnded)
  const [, render] = useState(0)
  return (
    <div>
      <output>{playback.status}</output>
      <button onClick={() => void playback.play()}>play</button>
      <button onClick={playback.pause}>pause</button>
      <button onClick={() => { render((value) => value + 1); void playback.repeat() }}>repeat</button>
    </div>
  )
}

describe('useCuePlayback', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    container.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('chooses Opus, repeats from the cue boundary and pauses on interruption', async () => {
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play, , repeat] = Array.from(container.querySelectorAll('button'))

    await act(async () => play.click())
    expect(MockAudio.latest.src).toBe(cue.audio?.opus)
    expect(MockAudio.latest.play).toHaveBeenCalledOnce()

    MockAudio.latest.currentTime = 8
    await act(async () => repeat.click())
    expect(MockAudio.latest.currentTime).toBe(0)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(MockAudio.latest.pause).toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('advances only when the current recorded cue ends', async () => {
    const ended = vi.fn()
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={ended} />))
    act(() => MockAudio.latest.dispatchEvent(new Event('ended')))
    expect(ended).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('ended')
    act(() => root.unmount())
  })
})
