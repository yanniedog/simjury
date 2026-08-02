import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AMBIENCE_PROFILES,
  courtroomAmbienceEnabled,
  setCourtroomAmbienceEnabled,
} from './ambience'

function storage(initial?: string): Storage {
  const values = new Map<string, string>()
  if (initial) values.set('simjury:ambience', initial)
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() { return values.size },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
})

describe('courtroom ambience', () => {
  it('uses restrained, distinct phase profiles', () => {
    expect(Object.keys(AMBIENCE_PROFILES)).toEqual([
      'intro',
      'openings',
      'beats',
      'closings',
      'juryroom',
      'reveal',
    ])
    expect(Math.max(...Object.values(AMBIENCE_PROFILES).map(({ volume }) => volume)))
      .toBeLessThanOrEqual(0.02)
    expect(new Set(Object.values(AMBIENCE_PROFILES).map(({ toneHz }) => toneHz)).size)
      .toBe(6)
  })

  it('persists an explicit preference without requiring storage', () => {
    expect(setCourtroomAmbienceEnabled(true)).toBe(true)
    expect(localStorage.getItem('simjury:ambience')).toBe('on')
    expect(setCourtroomAmbienceEnabled(false)).toBe(false)
    expect(localStorage.getItem('simjury:ambience')).toBe('off')

    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(setCourtroomAmbienceEnabled(true)).toBe(true)
    expect(courtroomAmbienceEnabled()).toBe(false)
  })
})
