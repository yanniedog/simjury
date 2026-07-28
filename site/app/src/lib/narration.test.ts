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
  setNarrationEngine,
  setNarrationRate,
  setNarrationSpeakers,
  speak,
  speakAll,
  voiceParamsFor,
  voiceQualityScore,
} from './narration'

afterEach(() => {
  setNarrationEnabled(false)
  setNarrationEngine('kokoro')
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

describe('seamless engine switch', () => {
  it('resumes the current line under the new engine instead of restarting the phase', async () => {
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
    const onLine = vi.fn()
    const done = vi.fn()

    speakAll([
      { text: 'Narrator cue', key: 'narrator' },
      { text: 'Prosecution opening', key: 'pc' },
      { text: 'Defence opening', key: 'dc' },
    ], { onLine, done })
    expect(onLine).toHaveBeenLastCalledWith('narrator', 0)
    FakeAudio.instances[0].onended?.()
    expect(onLine).toHaveBeenLastCalledWith('pc', 1)
    expect(FakeAudio.instances).toHaveLength(2)
    expect(FakeAudio.instances[1].src).toBe(naturalVoiceUrlFor('Prosecution opening', 'pc'))

    // Switch engines mid-line: playback must resume from the CURRENT line
    // ("pc", index 1) under the new engine — not from the top of the phase.
    setNarrationEngine('scylla')
    expect(FakeAudio.instances[1].pause).toHaveBeenCalled()
    expect(onLine).toHaveBeenLastCalledWith('pc', 1)
    expect(FakeAudio.instances).toHaveLength(3)
    expect(FakeAudio.instances[2].src).toBe(
      naturalVoiceUrlFor('Prosecution opening', 'pc', undefined, undefined, 'scylla'),
    )

    await FakeAudio.instances[2].play()
    FakeAudio.instances[2].onended?.()
    expect(onLine).toHaveBeenLastCalledWith('dc', 2)
    expect(FakeAudio.instances[3].src).toBe(
      naturalVoiceUrlFor('Defence opening', 'dc', undefined, undefined, 'scylla'),
    )
    await FakeAudio.instances[3].play()
    FakeAudio.instances[3].onended?.()
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
  it('keeps device voices distinct and advances past a speech error so later speakers still play', () => {
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

    // A narrator cue followed by two lawyers: the first lawyer's line fails
    // on this device, but the second lawyer must still be heard — one bad
    // line must never silence every speaker after it.
    speakAll([
      { text: 'Narrator cue', key: 'narrator' },
      { text: 'Prosecution opening', key: 'pc' },
      { text: 'Defence opening', key: 'dc' },
    ], { onLine, onError, done })
    expect(onLine).toHaveBeenLastCalledWith('narrator', 0)
    utterances[0].onend?.()
    expect(onLine).toHaveBeenLastCalledWith('pc', 1)

    utterances[1].onerror?.()
    expect(onError).toHaveBeenCalledOnce()
    expect(onLine).toHaveBeenLastCalledWith('dc', 2)
    expect(done).not.toHaveBeenCalled()

    const lastVoice = utterances[2].voice
    expect(lastVoice?.localService).toBe(true)
    utterances[2].onend?.()
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
    // No Audio API and no local device voice: narration is considered
    // entirely unsupported on this device, so it no-ops silently (never
    // sends text to a remote-only voice) but still calls done so the
    // sequence isn't stuck.
    expect(onError).not.toHaveBeenCalled()
    expect(onLine).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledOnce()
    expect(utterances).toHaveLength(0)
  })
})
