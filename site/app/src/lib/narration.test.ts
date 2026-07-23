import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fallbackVoiceIndexes,
  narrationRate,
  normaliseNarrationRate,
  setNarrationEnabled,
  setNarrationRate,
  speakAll,
  voiceParamsFor,
  voiceQualityScore,
} from './narration'

afterEach(() => {
  setNarrationEnabled(false)
  vi.unstubAllGlobals()
})

describe('voiceParamsFor', () => {
  it('is deterministic per speaker key', () => {
    expect(voiceParamsFor('J-07', 5)).toEqual(voiceParamsFor('J-07', 5))
  })

  it('gives the narrator a neutral pitch', () => {
    expect(voiceParamsFor('narrator', 5).pitch).toBe(1)
  })

  it('keeps pitch and rate in their designed bands', () => {
    for (const key of ['judge', 'clerk', 'w1', 'w5', 'J-01', 'J-11']) {
      const p = voiceParamsFor(key, 7)
      expect(p.pitch).toBeGreaterThanOrEqual(0.94)
      expect(p.pitch).toBeLessThanOrEqual(1.06)
      expect(p.rate).toBeGreaterThanOrEqual(0.94)
      expect(p.rate).toBeLessThanOrEqual(1.01)
      expect(p.voiceIndex).toBeGreaterThanOrEqual(0)
      expect(p.voiceIndex).toBeLessThan(7)
    }
  })

  it('survives a device with no voices', () => {
    expect(voiceParamsFor('anyone', 0).voiceIndex).toBe(0)
  })

  it('prefers a natural voice to a legacy local voice', () => {
    expect(voiceQualityScore('Microsoft Ava Natural', false)).toBeGreaterThan(
      voiceQualityScore('Desktop English', true),
    )
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
      { name: 'Microsoft Ava Natural', lang: 'en-US', localService: false },
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
    utterances[0].onend?.()
    expect(onLine).toHaveBeenLastCalledWith('dc', 1)
    expect(utterances[1].voice).not.toBe(firstVoice)
    utterances[1].onend?.()
    expect(done).toHaveBeenCalledOnce()
  })

  it('reports a sequence speech error without advancing unheard content', () => {
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
        getVoices: () => [],
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
    utterances[0].onerror?.()

    expect(onError).toHaveBeenCalledOnce()
    expect(onLine).toHaveBeenCalledOnce()
    expect(done).not.toHaveBeenCalled()
    expect(utterances).toHaveLength(1)
  })
})
