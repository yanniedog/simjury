// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneCue } from '../model/schema'
import { supportedAudioSource, useCuePlayback } from './useCuePlayback'

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
    aac: 'https://example.test/cue.m4a',
    mp3: 'https://example.test/cue.mp3',
    segmentId: 'segment-one',
    startSeconds: 12,
    endSeconds: 18,
  },
}

class MockAudio extends EventTarget {
  static instances: MockAudio[] = []
  src = ''
  preload = ''
  currentTime = 0
  ended = false
  play = vi.fn(async () => this.dispatchEvent(new Event('playing')))
  pause = vi.fn(() => this.dispatchEvent(new Event('pause')))
  load = vi.fn()
  constructor() {
    super()
    MockAudio.instances.push(this)
  }
  canPlayType(type: string) { return type.includes('opus') ? 'probably' : '' }
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
}

function Harness({ onEnded, activeCue = cue, nextSceneCue }: { onEnded: () => void; activeCue?: SceneCue; nextSceneCue?: SceneCue }) {
  const playback = useCuePlayback(activeCue, onEnded, nextSceneCue)
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
    MockAudio.instances = []
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
    const currentAudio = MockAudio.instances[0]

    await act(async () => play.click())
    expect(currentAudio.src).toBe(cue.audio?.opus)
    expect(currentAudio.play).toHaveBeenCalledOnce()

    currentAudio.currentTime = 15
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(currentAudio.pause).toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => play.click())
    expect(currentAudio.currentTime).toBe(12)

    await act(async () => repeat.click())
    expect(currentAudio.currentTime).toBe(12)

    act(() => root.unmount())
  })

  it('selects Opus, then AAC, then the MP3 compatibility fallback', () => {
    expect(supportedAudioSource({
      canPlayType: (type) => type.includes('opus') ? 'probably' : '',
    }, cue)).toBe(cue.audio?.opus)
    expect(supportedAudioSource({
      canPlayType: (type) => type.includes('mp4') ? 'maybe' : '',
    }, cue)).toBe(cue.audio?.aac)
    expect(supportedAudioSource({ canPlayType: () => '' }, cue)).toBe(cue.audio?.mp3)
  })

  it('ends exactly at the cue range rather than at the shared segment end', async () => {
    const ended = vi.fn()
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={ended} />))
    const currentAudio = MockAudio.instances[0]
    currentAudio.currentTime = 17.9
    act(() => currentAudio.dispatchEvent(new Event('timeupdate')))
    expect(ended).not.toHaveBeenCalled()
    currentAudio.currentTime = 18
    act(() => currentAudio.dispatchEvent(new Event('timeupdate')))
    expect(ended).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('ended')
    act(() => currentAudio.dispatchEvent(new Event('ended')))
    expect(ended).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('preloads metadata for only the next scene cue', async () => {
    const nextCue: SceneCue = {
      ...cue,
      id: 'next-scene-cue',
      audio: { ...cue.audio, opus: 'https://example.test/next.opus' },
    }
    const root = createRoot(container)
    await act(async () => root.render(
      <Harness activeCue={cue} nextSceneCue={nextCue} onEnded={() => undefined} />,
    ))
    expect(MockAudio.instances).toHaveLength(2)
    expect(MockAudio.instances[0].src).toBe(cue.audio?.opus)
    expect(MockAudio.instances[1].src).toBe(nextCue.audio?.opus)
    expect(MockAudio.instances[1].preload).toBe('metadata')
    expect(MockAudio.instances[1].play).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('resumes interrupted device speech without restarting the cue', async () => {
    const speechCue: SceneCue = { ...cue, id: 'cue-speech', audio: undefined }
    class MockUtterance {
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const synthesis = {
      paused: false,
      speak: vi.fn(),
      cancel: vi.fn(() => { synthesis.paused = false }),
      pause: vi.fn(() => { synthesis.paused = true }),
      resume: vi.fn(() => { synthesis.paused = false }),
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    const root = createRoot(container)
    await act(async () => root.render(<Harness activeCue={speechCue} onEnded={() => undefined} />))
    const [play, , repeat] = Array.from(container.querySelectorAll('button'))
    await act(async () => play.click())
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('speech-fallback')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(synthesis.pause).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('paused')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => play.click())
    expect(synthesis.resume).toHaveBeenCalledOnce()
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('speech-fallback')

    await act(async () => repeat.click())
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    act(() => root.unmount())
  })
})
