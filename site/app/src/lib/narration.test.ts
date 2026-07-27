import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearNarrationSpeakers,
  fallbackVoiceIndexes,
  NARRATION_SHARDS,
  narrationIdFor,
  narrationRate,
  narrationSupported,
  naturalVoiceUrlFor,
  normaliseNarrationRate,
  selectLocalVoices,
  setNarrationEnabled,
  setNarrationRate,
  setNarrationSpeakers,
  speak,
  speakAll,
  voiceParamsFor,
  voiceQualityScore,
} from './narration'

afterEach(() => {
  setNarrationEnabled(false)
  clearNarrationSpeakers()
  vi.unstubAllGlobals()
})

describe('voiceParamsFor', () => {
  it('maps text to an opaque, stable, sharded GitHub release asset', () => {
    const id = narrationIdFor('The evidence is ready.', 'pc', 'female', 'af_bella')
    expect(id).toMatch(/^pc-[0-9a-f]{8}$/)
    const url = naturalVoiceUrlFor('The evidence is ready.', 'pc', 'female', 'af_bella')
    const shard = url.match(/narration-kokoro-(\d+)/)?.[1]
    expect(url).toMatch(new RegExp(`/narration-kokoro-\\d+/${id}\\.mp3$`))
    expect(Number(shard)).toBeLessThan(NARRATION_SHARDS)
    expect(url).not.toContain('evidence')
    // Gender and voice are folded into the id so role remaps diverge cleanly.
    expect(narrationIdFor('The evidence is ready.', 'pc', 'female', 'af_bella')).not.toBe(
      narrationIdFor('The evidence is ready.', 'pc', 'male', 'bm_lewis'),
    )
  })

  it('is deterministic per speaker key', () => {
    expect(voiceParamsFor('J-07', 5)).toEqual(voiceParamsFor('J-07', 5))
  })

  it('gives the narrator a neutral pitch', () => {
    expect(voiceParamsFor('narrator', 5).pitch).toBe(1)
  })

  it('keeps pitch and rate in their designed bands', () => {
    for (const key of ['clerk', 'w1', 'w5', 'J-01', 'J-11']) {
      const p = voiceParamsFor(key, 7)
      expect(p.pitch).toBeGreaterThanOrEqual(0.9)
      expect(p.pitch).toBeLessThanOrEqual(1.12)
      expect(p.rate).toBeGreaterThanOrEqual(0.94)
      expect(p.rate).toBeLessThanOrEqual(1.01)
      expect(p.voiceIndex).toBeGreaterThanOrEqual(0)
      expect(p.voiceIndex).toBeLessThan(7)
    }
    const judge = voiceParamsFor('judge', 7)
    expect(judge.pitch).toBeLessThan(0.95)
    expect(judge.rate).toBeLessThan(0.95)
  })

  it('survives a device with no voices', () => {
    expect(voiceParamsFor('anyone', 0).voiceIndex).toBe(0)
  })

  it('excludes remote synthesis voices even when they advertise higher quality', () => {
    const selected = selectLocalVoices([
      { name: 'Desktop English', lang: 'en-US', localService: true },
      { name: 'Cloud Neural', lang: 'en-US', localService: false },
    ] as SpeechSynthesisVoice[])
    expect(selected.map((voice) => voice.name)).toEqual(['Desktop English'])
  })

  it('prefers natural variants within the local tier', () => {
    expect(voiceQualityScore('English Natural', true)).toBeGreaterThan(
      voiceQualityScore('Desktop English', true),
    )
  })

  it('keeps adjacent different speakers on distinct available voices', () => {
    const indexes = fallbackVoiceIndexes(['pc', 'dc', 'dc', 'w1'], 2)
    expect(indexes[0]).not.toBe(indexes[1])
    expect(indexes[1]).toBe(indexes[2])
    expect(indexes[2]).not.toBe(indexes[3])
  })

  it('uses gender-matched voices when a case plan is registered', () => {
    setNarrationSpeakers({
      cast: [
        { id: 'pc', name: 'Asha Verlaine' },
        { id: 'dc', name: 'Theo Marchetti' },
      ],
    })
    const deviceVoices = [
      { name: 'Microsoft Zira', lang: 'en-US', localService: true },
      { name: 'Microsoft David', lang: 'en-US', localService: true },
      { name: 'Google UK English Female', lang: 'en-GB', localService: true },
      { name: 'Google UK English Male', lang: 'en-GB', localService: true },
    ] as SpeechSynthesisVoice[]
    vi.stubGlobal('window', {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => deviceVoices,
        speak: vi.fn(),
      },
    })
    expect(narrationSupported()).toBe(true)
    const indexes = fallbackVoiceIndexes(['pc', 'dc'], deviceVoices.length)
    expect(indexes[0]).not.toBe(indexes[1])
    expect(deviceVoices[indexes[0]].name).toMatch(/Zira|Female/)
    expect(deviceVoices[indexes[1]].name).toMatch(/David|Male/)
  })

})

describe('natural narration', () => {
  it('plays the GitHub-hosted Kokoro-82M clip before using device speech', async () => {
    class FakeAudio {
      static instances: FakeAudio[] = []
      preload = ''
      playbackRate = 1
      onplay: (() => void) | null = null
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      pause = vi.fn()
      load = vi.fn()
      removeAttribute = vi.fn()
      play = vi.fn().mockResolvedValue(undefined)

      constructor(readonly src: string) {
        FakeAudio.instances.push(this)
      }
    }
    const values = new Map<string, string>()
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    setNarrationEnabled(true)
    const done = vi.fn()

    speak('The evidence is ready.', 'pc', done, 1.15)
    expect(FakeAudio.instances[0].src).toBe(
      naturalVoiceUrlFor('The evidence is ready.', 'pc'),
    )
    expect(FakeAudio.instances[0].playbackRate).toBe(1.15)
    await FakeAudio.instances[0].play()
    FakeAudio.instances[0].onended?.()
    expect(done).toHaveBeenCalledOnce()
  })
})

describe('normaliseNarrationRate', () => {
  it('accepts only the designed persisted rates', () => {
    expect(normaliseNarrationRate('0.85')).toBe(0.85)
    expect(normaliseNarrationRate(1.15)).toBe(1.15)
    expect(normaliseNarrationRate('1.5')).toBe(1)
    expect(normaliseNarrationRate('not-a-rate')).toBe(1)
  })

  it('persists safely when storage is available', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })

    expect(setNarrationRate(0.85)).toBe(0.85)
    expect(narrationRate()).toBe(0.85)
  })

  it('keeps a session fallback when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })

    expect(setNarrationRate(1.15)).toBe(1.15)
    expect(narrationRate()).toBe(1.15)
  })
})

describe('speakAll', () => {
  it('keeps device voices distinct without advancing on speech error', () => {
    class FakeUtterance {
      voice?: SpeechSynthesisVoice
      pitch = 1
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null

      constructor(readonly text: string) {}
    }
    const utterances: FakeUtterance[] = []
    const deviceVoices = [
      { name: 'Desktop English', lang: 'en-US', localService: true },
      { name: 'Microsoft Ava Natural', lang: 'en-US', localService: true },
      { name: 'Cloud Neural', lang: 'en-US', localService: false },
    ] as SpeechSynthesisVoice[]
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => deviceVoices,
        speak: (utterance: FakeUtterance) => utterances.push(utterance),
      },
    })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    setNarrationEnabled(true)
    const onLine = vi.fn()
    const onError = vi.fn()
    const done = vi.fn()

    speakAll([
      { text: 'First line', key: 'pc' },
      { text: 'Second line', key: 'dc' },
    ], { onLine, onError, done })
    expect(onLine).toHaveBeenLastCalledWith('pc', 0)
    expect(done).not.toHaveBeenCalled()

    utterances[0].onerror?.()
    expect(onError).toHaveBeenCalledOnce()
    expect(onLine).toHaveBeenCalledOnce()
    expect(done).not.toHaveBeenCalled()
    expect(utterances).toHaveLength(1)

    // Restart a clean sequence to assert adjacent speakers stay distinct on success.
    utterances.length = 0
    onLine.mockClear()
    done.mockClear()
    speakAll([
      { text: 'First line', key: 'pc' },
      { text: 'Second line', key: 'dc' },
    ], { onLine, done })
    const firstVoice = utterances[0].voice
    expect(firstVoice?.localService).toBe(true)
    utterances[0].onend?.()
    expect(onLine).toHaveBeenLastCalledWith('dc', 1)
    expect(utterances[1].voice).not.toBe(firstVoice)
    utterances[1].onend?.()
    expect(done).toHaveBeenCalledOnce()
  })

  it('does not send text to a remote voice when no local voice is available', () => {
    class FakeUtterance {
      voice?: SpeechSynthesisVoice
      pitch = 1
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null

      constructor(readonly text: string) {}
    }
    const utterances: FakeUtterance[] = []
    vi.stubGlobal('window', {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => [
          { name: 'Cloud Neural', lang: 'en-US', localService: false },
        ],
        speak: (utterance: FakeUtterance) => utterances.push(utterance),
      },
    })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
    vi.stubGlobal('localStorage', {
      getItem: () => 'on',
      setItem: vi.fn(),
    })
    const onLine = vi.fn()
    const onError = vi.fn()
    const done = vi.fn()

    speakAll([
      { text: 'First line', key: 'pros' },
      { text: 'Second line', key: 'defc' },
    ], { onLine, onError, done })
    expect(onError).not.toHaveBeenCalled()
    expect(onLine).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledOnce()
    expect(utterances).toHaveLength(0)
  })
})
