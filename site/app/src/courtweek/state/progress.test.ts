import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredWeeklyProgress } from './progress'
import {
  clearMemoryProgressForTests,
  exportWeeklyProgress,
  importWeeklyProgress,
  loadWeeklyProgress,
  saveWeeklyProgress,
} from './progress'

const progress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: '2026.08.03-r1',
  highestObservedTime: '2026-08-10T08:30:00+10:00',
  completedSessionIds: ['mon'],
  currentSessionId: 'tue',
  currentSceneId: 'tue-scene-1',
  currentCueId: 'tue-cue-1',
  notes: 'Check the warning record.',
  accessibilityMode: 'captions',
}

describe('weekly progress', () => {
  beforeEach(() => clearMemoryProgressForTests())

  it('falls back to in-memory persistence when IndexedDB is unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      await expect(saveWeeklyProgress('cw-0001', progress)).resolves.toBe('memory')
      await expect(loadWeeklyProgress('cw-0001')).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('falls back to memory when opening private storage is blocked', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    const factory = {
      open: () => { throw new DOMException('Private storage is blocked.', 'SecurityError') },
    } as unknown as IDBFactory
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })
    try {
      await expect(saveWeeklyProgress('cw-0001', progress)).resolves.toBe('memory')
      await expect(loadWeeklyProgress('cw-0001')).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('rejects a corrupt IndexedDB record instead of hydrating partial progress', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    const openRequest = {} as IDBOpenDBRequest
    const getRequest = {} as IDBRequest<unknown>
    Object.defineProperty(getRequest, 'result', { value: { courtWeekId: 'cw-0001', notes: 'partial' } })
    const transaction = {
      error: null,
      objectStore: () => ({
        get: () => {
          queueMicrotask(() => {
            getRequest.onsuccess?.({} as Event)
            queueMicrotask(() => transaction.oncomplete?.({} as Event))
          })
          return getRequest
        },
      } as unknown as IDBObjectStore),
    } as unknown as IDBTransaction
    const database = {
      transaction: () => transaction,
      close: () => undefined,
    } as unknown as IDBDatabase
    Object.defineProperty(openRequest, 'result', { value: database })
    const factory = {
      open: () => {
        queueMicrotask(() => openRequest.onsuccess?.({} as Event))
        return openRequest
      },
    } as unknown as IDBFactory
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })
    try {
      await expect(loadWeeklyProgress('cw-0001')).resolves.toBeNull()
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('does not report durability when the IndexedDB transaction aborts after put succeeds', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    const openRequest = {} as IDBOpenDBRequest
    const putRequest = {} as IDBRequest<IDBValidKey>
    const transaction = {
      error: null,
      objectStore: () => ({
        put: () => {
          queueMicrotask(() => {
            putRequest.onsuccess?.({} as Event)
            queueMicrotask(() => {
              Object.defineProperty(transaction, 'error', {
                configurable: true,
                value: new DOMException('Storage quota exhausted.', 'QuotaExceededError'),
              })
              transaction.onabort?.({} as Event)
            })
          })
          return putRequest
        },
      } as unknown as IDBObjectStore),
    } as unknown as IDBTransaction
    const database = {
      transaction: () => transaction,
      close: () => undefined,
    } as unknown as IDBDatabase
    Object.defineProperty(openRequest, 'result', { value: database })
    const factory = {
      open: () => {
        queueMicrotask(() => openRequest.onsuccess?.({} as Event))
        return openRequest
      },
    } as unknown as IDBFactory
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })

    try {
      await expect(saveWeeklyProgress('cw-0001', progress)).resolves.toBe('memory')
      await expect(loadWeeklyProgress('cw-0001')).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('exports access preferences while omitting private notes by default', () => {
    const exported = exportWeeklyProgress(progress)
    expect(exported).toContain('"accessibilityMode": "captions"')
    expect(exported).not.toContain('Check the warning record.')
    expect(importWeeklyProgress(exported, 'cw-0001', '2026.08.03-r1')).toEqual({
      ...progress,
      notes: '',
    })
  })

  it('round-trips ballots and deliberation while keeping notes opt-in', () => {
    const deliberated: StoredWeeklyProgress = {
      ...progress,
      provisionalVote: 'manslaughter',
      secondVote: 'not-guilty',
      finalVote: 'not-guilty',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: true,
      returnedVerdict: 'not-guilty',
      returnedAgreement: 'majority',
      reasoningContributions: [{
        sceneId: 'sat-discussion',
        legalQuestion: 'Causation',
        evidenceId: 'ex-survival',
        move: 'test-source',
        recordedAt: '2026-08-15T10:00:00+10:00',
        influencePenalty: 0,
      }],
    }
    const withoutNotes = importWeeklyProgress(
      exportWeeklyProgress(deliberated),
      'cw-0001',
      '2026.08.03-r1',
    )
    expect(withoutNotes).toEqual({ ...deliberated, notes: '' })
    expect(importWeeklyProgress(
      exportWeeklyProgress(deliberated, true),
      'cw-0001',
      '2026.08.03-r1',
    )).toEqual(deliberated)
  })

  it('rejects progress from a different case revision', () => {
    expect(() => importWeeklyProgress(
      exportWeeklyProgress(progress, true),
      'cw-0001',
      '2026.08.03-r2',
    )).toThrow('different case revision')
  })
})
