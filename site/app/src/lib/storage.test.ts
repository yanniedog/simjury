import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearProgress,
  loadAllPlays,
  loadPlay,
  loadProgress,
  savePlay,
  saveProgress,
} from './storage'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const KEY = 'simjury-daily:v1:5'

afterEach(() => vi.unstubAllGlobals())

describe('storage', () => {
  it('round-trips a valid play', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [60, 40], verdict: 'Not Guilty' })
    expect(loadPlay(5)).toEqual({
      day: 5,
      caseId: 'd-0001',
      convictions: [60, 40],
      verdict: 'Not Guilty',
    })
  })

  it('returns null when there is no play for that day', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [60], verdict: 'Guilty' })
    expect(loadPlay(6)).toBeNull()
  })

  it('rejects corrupted JSON rather than throwing', () => {
    const store = memoryStorage()
    store.setItem(KEY, '{ not valid json')
    vi.stubGlobal('localStorage', store)
    expect(loadPlay(5)).toBeNull()
  })

  it('rejects a structurally invalid play', () => {
    const store = memoryStorage()
    store.setItem(
      KEY,
      JSON.stringify({ day: 5, convictions: 'nope', verdict: 'Guilty' }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadPlay(5)).toBeNull()
  })

  it('round-trips the correctness and trap fields', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({
      day: 5,
      caseId: 'd-0001',
      convictions: [70],
      verdict: 'Guilty',
      correct: true,
      swayedByTraps: 1,
      totalTraps: 2,
    })
    expect(loadPlay(5)?.correct).toBe(true)
    expect(loadPlay(5)?.swayedByTraps).toBe(1)
  })

  it('rejects a play saved without a caseId (pre-caseId schema)', () => {
    const store = memoryStorage()
    store.setItem(
      KEY,
      JSON.stringify({ day: 5, convictions: [60], verdict: 'Guilty' }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadPlay(5)).toBeNull()
  })
})

describe('loadAllPlays', () => {
  it('returns every valid play and skips corrupt entries', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    savePlay({ day: 1, caseId: 'd-0001', convictions: [50], verdict: 'Guilty', correct: true })
    savePlay({ day: 2, caseId: 'd-0002', convictions: [40], verdict: 'Not Guilty', correct: false })
    store.setItem('simjury-daily:v1:3', '{ corrupt')
    store.setItem('unrelated-key', 'ignored')

    const all = loadAllPlays()
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.day).sort()).toEqual([1, 2])
  })
})

describe('in-progress sitting', () => {
  it('round-trips and clears same-day progress', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveProgress({
      day: 5,
      caseId: 'd-0001',
      phase: 'beats',
      beatIndex: 3,
      checkinValues: [65],
      conviction: 65,
    })
    expect(loadProgress(5)?.beatIndex).toBe(3)
    clearProgress(5)
    expect(loadProgress(5)).toBeNull()
  })

  it('rejects malformed progress', () => {
    const store = memoryStorage()
    store.setItem('simjury-progress:v1:5', JSON.stringify({ day: 5, phase: 'beats' }))
    vi.stubGlobal('localStorage', store)
    expect(loadProgress(5)).toBeNull()
  })

  it('rejects out-of-range conviction history', () => {
    const store = memoryStorage()
    store.setItem(
      'simjury-progress:v1:5',
      JSON.stringify({
        day: 5,
        caseId: 'd-0001',
        phase: 'beats',
        beatIndex: 3,
        checkinValues: [120],
        conviction: 50,
      }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadProgress(5)).toBeNull()
  })
})
