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

function Harness({ onEnded, activeCue = cue, nextSceneCue, deferSourceUntilPlay = false }: {
  onEnded: () => void
  activeCue?: SceneCue
  nextSceneCue?: SceneCue
  deferSourceUntilPlay?: boolean
}) {
  const playback = useCuePlayback(activeCue, onEnded, nextSceneCue, { deferSourceUntilPlay })
  const [, render] = useState(0)
  return (
    <div>
      <output>{playback.status}</output>
      <output data-testid="turn">{playback.activeTurnId}</output>
      <button onClick={() => void playback.play()}>play</button>
      <button onClick={playback.pause}>pause</button>
      <button onClick={() => { render((value) => value + 1); void playback.repeat() }}>repeat</button>
    </div>
  )
}

describe('useCuePlayback', () => {
  let container: HTMLDivElement
  let speechSynthesisDescriptor: PropertyDescriptor | undefined
  let visibilityDescriptor: PropertyDescriptor | undefined
  let mediaDevicesDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    MockAudio.instances = []
    speechSynthesisDescriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis')
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    container = document.createElement('div')
    document.body.append(container)
    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    vi.useRealTimers()
    container.remove()
    if (speechSynthesisDescriptor) {
      Object.defineProperty(window, 'speechSynthesis', speechSynthesisDescriptor)
    } else {
      Reflect.deleteProperty(window, 'speechSynthesis')
    }
    if (visibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityDescriptor)
    } else {
      Reflect.deleteProperty(document, 'visibilityState')
    }
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor)
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices')
    }
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

  it('switches presentation at recorded turn boundaries and resumes the incomplete turn', async () => {
    const activeCue: SceneCue = {
      ...cue,
      turns: [
        { id: 'cue-audio__1', speaker: 'Counsel', text: 'Question?' },
        { id: 'cue-audio__2', speaker: 'Witness', text: 'Answer.' },
      ],
      audio: {
        ...cue.audio!,
        turns: [
          { id: 'cue-audio__1', startSeconds: 12, endSeconds: 15 },
          { id: 'cue-audio__2', startSeconds: 15, endSeconds: 18 },
        ],
      },
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness activeCue={activeCue} onEnded={() => undefined} />))
    const currentAudio = MockAudio.instances[0]
    expect(container.querySelector('[data-testid="turn"]')?.textContent).toBe('cue-audio__1')

    currentAudio.currentTime = 15
    act(() => currentAudio.dispatchEvent(new Event('timeupdate')))
    expect(container.querySelector('[data-testid="turn"]')?.textContent).toBe('cue-audio__2')

    currentAudio.currentTime = 16
    act(() => currentAudio.pause())
    expect(currentAudio.currentTime).toBe(15)
    expect(container.querySelector('[data-testid="turn"]')?.textContent).toBe('cue-audio__2')
    act(() => root.unmount())
  })

  it('detects the incomplete recorded turn when interruption precedes its timeupdate', async () => {
    const activeCue: SceneCue = {
      ...cue,
      turns: [
        { id: 'cue-audio__1', speaker: 'Counsel', text: 'Question?' },
        { id: 'cue-audio__2', speaker: 'Witness', text: 'Answer.' },
      ],
      audio: {
        ...cue.audio!,
        turns: [
          { id: 'cue-audio__1', startSeconds: 12, endSeconds: 15 },
          { id: 'cue-audio__2', startSeconds: 15, endSeconds: 18 },
        ],
      },
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness activeCue={activeCue} onEnded={() => undefined} />))
    const currentAudio = MockAudio.instances[0]

    currentAudio.currentTime = 16
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(currentAudio.currentTime).toBe(15)
    expect(container.querySelector('[data-testid="turn"]')?.textContent).toBe('cue-audio__2')
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

  it('defers the active narration source until the play gesture', async () => {
    const root = createRoot(container)
    await act(async () => root.render(
      <Harness activeCue={cue} deferSourceUntilPlay onEnded={() => undefined} />,
    ))
    const currentAudio = MockAudio.instances[0]
    expect(currentAudio.src).toBe('')
    expect(currentAudio.preload).toBe('none')

    await act(async () => Array.from(container.querySelectorAll('button'))[0].click())

    expect(currentAudio.src).toBe(cue.audio?.opus)
    expect(currentAudio.preload).toBe('metadata')
    expect(currentAudio.play).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('restarts interrupted device speech without a synchronous cancel callback advancing the turn', async () => {
    const speechCue: SceneCue = {
      ...cue,
      id: 'cue-speech',
      audio: undefined,
      turns: [
        { id: 'cue-speech__1', speaker: 'Counsel', text: 'Question?' },
        { id: 'cue-speech__2', speaker: 'Witness', text: 'Answer.' },
      ],
    }
    class MockUtterance {
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    let activeUtterance: MockUtterance | null = null
    const synthesis = {
      paused: false,
      getVoices: vi.fn(() => [{ lang: 'en-AU', name: 'Test voice' }]),
      speak: vi.fn((utterance: MockUtterance) => { activeUtterance = utterance }),
      cancel: vi.fn(() => {
        synthesis.paused = false
        activeUtterance?.onend?.()
      }),
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
    expect(synthesis.cancel).toHaveBeenCalled()
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(synthesis.pause).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('paused')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => play.click())
    expect(synthesis.resume).not.toHaveBeenCalled()
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(container.querySelector('output')?.textContent).toBe('speech-fallback')

    await act(async () => repeat.click())
    expect(synthesis.speak).toHaveBeenCalledTimes(3)
    act(() => root.unmount())
  })

  it('rewinds to the cue boundary when pagehide fires before visibility changes', async () => {
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    await act(async () => play.click())
    currentAudio.pause.mockClear()
    currentAudio.currentTime = 15
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(currentAudio.pause).toHaveBeenCalledOnce()
    expect(currentAudio.currentTime).toBe(12)
    act(() => root.unmount())
  })

  it('rewinds an operating-system media pause to the cue boundary', async () => {
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    await act(async () => play.click())
    currentAudio.currentTime = 15

    act(() => currentAudio.pause())

    expect(currentAudio.currentTime).toBe(12)
    expect(container.querySelector('output')?.textContent).toBe('paused')
    act(() => root.unmount())
  })

  it('uses reading mode when device speech has no available voice', async () => {
    const speechCue: SceneCue = { ...cue, id: 'cue-no-voice', audio: undefined }
    class MockUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const synthesis = {
      paused: false,
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })

    const root = createRoot(container)
    await act(async () => root.render(<Harness activeCue={speechCue} onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    await act(async () => play.click())

    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('reading-fallback')
    act(() => root.unmount())
  })

  it('pauses and rewinds for a Bluetooth-like media-device change', async () => {
    const mediaDevices = new EventTarget()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    await act(async () => play.click())
    currentAudio.pause.mockClear()
    currentAudio.currentTime = 15

    act(() => mediaDevices.dispatchEvent(new Event('devicechange')))

    expect(currentAudio.pause).toHaveBeenCalledOnce()
    expect(currentAudio.currentTime).toBe(12)
    expect(container.querySelector('output')?.textContent).toBe('paused')
    act(() => root.unmount())
  })

  it('retries recorded audio once before using device speech', async () => {
    class MockUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const synthesis = {
      paused: false,
      getVoices: vi.fn(() => [{ lang: 'en-AU', name: 'Test voice' }]),
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    currentAudio.load.mockImplementationOnce(() => currentAudio.dispatchEvent(new Event('pause')))
    await act(async () => play.click())

    await act(async () => currentAudio.dispatchEvent(new Event('error')))
    expect(currentAudio.load).toHaveBeenCalledOnce()
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('playing')
    await act(async () => currentAudio.dispatchEvent(new Event('error')))

    expect(currentAudio.load).toHaveBeenCalledOnce()
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(container.querySelector('output')?.textContent).toBe('speech-fallback')
    act(() => root.unmount())
  })

  it('retries a rejected play once and ignores a late error after speech fallback', async () => {
    class MockUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const synthesis = {
      paused: false,
      getVoices: vi.fn(() => [{ lang: 'en-AU', name: 'Test voice' }]),
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    currentAudio.play.mockRejectedValue(new Error('Output interrupted.'))
    await act(async () => play.click())
    expect(currentAudio.play).toHaveBeenCalledTimes(2)
    expect(currentAudio.load).toHaveBeenCalledOnce()
    expect(synthesis.speak).toHaveBeenCalledOnce()

    act(() => currentAudio.dispatchEvent(new Event('error')))

    expect(currentAudio.load).toHaveBeenCalledOnce()
    expect(synthesis.speak).toHaveBeenCalledOnce()
    act(() => root.unmount())
  })

  it('times out two stalled attempts before exposing reading mode', async () => {
    vi.useFakeTimers()
    class MockUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const synthesis = {
      paused: false,
      getVoices: vi.fn(() => []),
      speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis })
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    currentAudio.play.mockImplementation(() => new Promise<boolean>(() => undefined))

    act(() => play.click())
    await act(async () => vi.advanceTimersByTimeAsync(10_000))

    expect(currentAudio.play).toHaveBeenCalledTimes(2)
    expect(currentAudio.load).toHaveBeenCalledOnce()
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('reading-fallback')
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('does not retry or narrate after a stalled attempt is interrupted', async () => {
    vi.useFakeTimers()
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    currentAudio.play.mockImplementation(() => new Promise<boolean>(() => undefined))

    act(() => play.click())
    act(() => window.dispatchEvent(new Event('pagehide')))
    await act(async () => vi.advanceTimersByTimeAsync(15_000))

    expect(currentAudio.play).toHaveBeenCalledOnce()
    expect(currentAudio.load).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('paused')
    act(() => root.unmount())
  })

  it('ignores a stale attempt that settles after the juror resumes', async () => {
    let finishFirst!: (value: boolean) => void
    const firstAttempt = new Promise<boolean>((resolve) => { finishFirst = resolve })
    const root = createRoot(container)
    await act(async () => root.render(<Harness onEnded={() => undefined} />))
    const [play, pause] = Array.from(container.querySelectorAll('button'))
    const currentAudio = MockAudio.instances[0]
    currentAudio.play
      .mockImplementationOnce(() => firstAttempt)
      .mockImplementationOnce(async () => currentAudio.dispatchEvent(new Event('playing')))

    act(() => play.click())
    act(() => pause.click())
    await act(async () => play.click())
    await act(async () => finishFirst(true))

    expect(currentAudio.play).toHaveBeenCalledTimes(2)
    expect(currentAudio.load).not.toHaveBeenCalled()
    expect(container.querySelector('output')?.textContent).toBe('playing')
    act(() => root.unmount())
  })
})
