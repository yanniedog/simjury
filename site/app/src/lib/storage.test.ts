import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canPersistSitting,
  clearProgress,
  completePlay,
  loadAllPlays,
  loadPlay,
  loadPlayForSitting,
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
  it('probes whether storage accepts writes without leaving probe data behind', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)

    expect(canPersistSitting()).toBe(true)
    expect(store.length).toBe(0)
  })

  it('reports unavailable storage when writes are blocked', () => {
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('blocked')
      },
    })

    expect(canPersistSitting()).toBe(false)
  })

  it('round-trips a valid play', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [], verdict: 'Not Guilty' })
    expect(loadPlay(5)).toEqual({
      day: 5,
      caseId: 'd-0001',
      convictions: [],
      verdict: 'Not Guilty',
    })
  })

  it('returns null when there is no play for that day', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [], verdict: 'Guilty' })
    expect(loadPlay(6)).toBeNull()
  })

  it('keeps each sitting verdict under its own day', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [], verdict: 'Guilty' })
    savePlay({ day: 6, caseId: 'd-0002', convictions: [], verdict: 'Not Guilty' })

    expect(loadPlay(5)?.verdict).toBe('Guilty')
    expect(loadPlay(6)?.verdict).toBe('Not Guilty')
  })

  it('only restores a verdict for its matching case', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({ day: 5, caseId: 'd-0001', convictions: [], verdict: 'Guilty' })

    expect(loadPlayForSitting(5, 'd-0001')?.verdict).toBe('Guilty')
    expect(loadPlayForSitting(5, 'd-0002')).toBeNull()
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

  it('round-trips the correctness field', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePlay({
      day: 5,
      caseId: 'd-0001',
      convictions: [],
      verdict: 'Guilty',
      correct: true,
    })
    expect(loadPlay(5)?.correct).toBe(true)
  })

  it('rejects a play saved without a caseId (pre-caseId schema)', () => {
    const store = memoryStorage()
    store.setItem(
      KEY,
      JSON.stringify({ day: 5, convictions: [], verdict: 'Guilty' }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadPlay(5)).toBeNull()
  })
})

describe('loadAllPlays', () => {
  it('returns every valid play and skips corrupt entries', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    savePlay({ day: 1, caseId: 'd-0001', convictions: [], verdict: 'Guilty', correct: true })
    savePlay({ day: 2, caseId: 'd-0002', convictions: [], verdict: 'Not Guilty', correct: false })
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
      notes: [{ ownerId: 'player', beatId: 'b1', text: 'Seemed unsure.' }],
    })
    expect(loadProgress(5)?.beatIndex).toBe(3)
    expect(loadProgress(5)?.notes).toEqual([
      { ownerId: 'player', beatId: 'b1', text: 'Seemed unsure.' },
    ])
    clearProgress(5)
    expect(loadProgress(5)).toBeNull()
  })

  it('defaults missing notes to an empty list for legacy progress', () => {
    const store = memoryStorage()
    store.setItem(
      'simjury-progress:v1:5',
      JSON.stringify({
        day: 5,
        caseId: 'd-0001',
        phase: 'beats',
        beatIndex: 2,
      }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadProgress(5)?.notes).toEqual([])
  })

  it('clears pre-record progress without deleting the finished play', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveProgress({
      day: 5,
      caseId: 'd-0001',
      phase: 'closings',
      beatIndex: 9,
    })
    savePlay({
      day: 5,
      caseId: 'd-0001',
      convictions: [],
      verdict: 'Guilty',
    })

    clearProgress(5)

    expect(loadProgress(5)).toBeNull()
    expect(loadPlay(5)?.verdict).toBe('Guilty')
  })

  it('stores a sealed room result and clears progress idempotently', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    saveProgress({
      day: 5,
      caseId: 'd-0001',
      phase: 'juryroom',
      beatIndex: 9,
    })
    const play = {
      day: 5,
      caseId: 'd-0001',
      convictions: [],
      verdict: 'Guilty' as const,
      correct: true,
      room: {
        kind: 'majority' as const,
        verdict: 'guilty' as const,
        g: 8,
        ng: 4,
      },
    }

    completePlay(play)
    completePlay(play)

    expect(loadPlay(5)).toEqual(play)
    expect(loadProgress(5)).toBeNull()
  })

  it('retains resumable progress when a sealed result cannot be stored', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    saveProgress({
      day: 5,
      caseId: 'd-0001',
      phase: 'juryroom',
      beatIndex: 9,
    })
    store.setItem = () => {
      throw new Error('storage full')
    }

    completePlay({
      day: 5,
      caseId: 'd-0001',
      convictions: [],
      verdict: 'Guilty',
    })

    expect(loadPlay(5)).toBeNull()
    expect(loadProgress(5)?.phase).toBe('juryroom')
  })

  it('rejects malformed progress', () => {
    const store = memoryStorage()
    store.setItem('simjury-progress:v1:5', JSON.stringify({ day: 5, phase: 'beats' }))
    vi.stubGlobal('localStorage', store)
    expect(loadProgress(5)).toBeNull()
  })

  it('rejects legacy progress that still carries check-in fields without a beat index', () => {
    const store = memoryStorage()
    store.setItem(
      'simjury-progress:v1:5',
      JSON.stringify({
        day: 5,
        caseId: 'd-0001',
        phase: 'beats',
      }),
    )
    vi.stubGlobal('localStorage', store)
    expect(loadProgress(5)).toBeNull()
  })
})
