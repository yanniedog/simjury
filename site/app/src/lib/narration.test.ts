import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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

  it('prefers an offline local voice to a remote natural voice', () => {
    expect(voiceQualityScore('Desktop English', true)).toBeGreaterThan(
      voiceQualityScore('Microsoft Ava Natural', false),
    )
  })

  it('prefers natural variants within the local tier', () => {
    expect(voiceQualityScore('English Natural', true)).toBeGreaterThan(
      voiceQualityScore('Desktop English', true),
    )
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
  it('tracks each line and signals when the sequence completes', () => {
    class FakeUtterance {
      voice?: SpeechSynthesisVoice
      pitch = 1
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null

      constructor(readonly text: string) {}
    }
    const utterances: FakeUtterance[] = []
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      speechSynthesis: {
        cancel: vi.fn(),
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
    const done = vi.fn()

    speakAll([
      { text: 'First line', key: 'pros' },
      { text: 'Second line', key: 'defc' },
    ], { onLine, done })
    expect(onLine).toHaveBeenLastCalledWith('pros')
    expect(done).not.toHaveBeenCalled()

    utterances[0].onend?.()
    expect(onLine).toHaveBeenLastCalledWith('defc')
    utterances[1].onend?.()
    expect(done).toHaveBeenCalledOnce()
  })
})
