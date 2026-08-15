import { beforeEach, describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { elevenMinutesDeliberation } from '../content/deliberation'
import { withDeveloperFreshUnanimityBallot } from '../sealed/developerPreview'
import type { StoredWeeklyProgress } from './progress'
import {
  clearMemoryProgressForTests,
  exportWeeklyProgress,
  importWeeklyProgress,
  loadWeeklyProgressResult,
  loadWeeklyProgress,
  mergeImportedWeeklyProgress,
  openProgressDatabase,
  saveWeeklyProgress,
} from './progress'

const progress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: '2026.08.03-r2',
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
      await expect(loadWeeklyProgress('cw-0001', progress.revision)).resolves.toEqual(progress)
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
      await expect(loadWeeklyProgress('cw-0001', progress.revision)).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('keeps a blocked database upgrade pending until the saved record can be read', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    const openRequest = {} as IDBOpenDBRequest
    const database = { close: () => undefined } as unknown as IDBDatabase
    Object.defineProperty(openRequest, 'result', { value: database })
    const factory = {
      open: () => {
        queueMicrotask(() => openRequest.onblocked?.({} as IDBVersionChangeEvent))
        return openRequest
      },
    } as unknown as IDBFactory
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory })
    try {
      let settled = false
      let reportedBlocked = false
      const opening = openProgressDatabase(() => { reportedBlocked = true })
        .then((result) => { settled = true; return result })
      await Promise.resolve()
      await Promise.resolve()
      expect(reportedBlocked).toBe(true)
      expect(settled).toBe(false)

      openRequest.onsuccess?.({} as Event)
      await expect(opening).resolves.toBe(database)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('keeps revisions separate and never treats an archived ballot as current', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    const archived = {
      ...progress,
      revision: '2026.08.03-r1',
      provisionalVote: 'murder' as const,
      sealedVerdict: 'murder' as const,
      sealedAgreement: 'unanimous' as const,
    }
    try {
      await saveWeeklyProgress(archived.courtWeekId, archived)
      await expect(loadWeeklyProgressResult(progress.courtWeekId, progress.revision)).resolves.toMatchObject({
        progress: null,
        archives: [{ revision: archived.revision, provisionalVote: 'murder' }],
      })

      await saveWeeklyProgress(progress.courtWeekId, progress)
      await expect(loadWeeklyProgress(progress.courtWeekId, archived.revision)).resolves.toEqual(archived)
      await expect(loadWeeklyProgress(progress.courtWeekId, progress.revision)).resolves.toEqual(progress)
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
      await expect(loadWeeklyProgressResult('cw-0001', progress.revision)).resolves.toEqual({
        progress: null,
        archives: [],
        issue: 'corrupt',
      })
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
      await expect(loadWeeklyProgress('cw-0001', progress.revision)).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('exports access preferences while omitting private notes by default', () => {
    const exported = exportWeeklyProgress(progress)
    expect(exported).toContain('"accessibilityMode": "captions"')
    expect(exported).not.toContain('Check the warning record.')
    expect(importWeeklyProgress(exported, 'cw-0001', '2026.08.03-r2')).toEqual({
      ...progress,
      notes: '',
    })
    expect(() => exportWeeklyProgress({ ...progress, notes: 'x'.repeat(1024 * 1024) }, true))
      .toThrow(/too large to transfer/i)
  })

  it('keeps receiving-device notes when an export omitted them', () => {
    expect(mergeImportedWeeklyProgress(progress, { ...progress, notes: '' }).notes).toBe(progress.notes)
  })

  it('round-trips ballots and deliberation while keeping notes opt-in', () => {
    const deliberated: StoredWeeklyProgress = {
      ...progress,
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.map(({ id }) => id),
      currentSessionId: undefined,
      currentSceneId: undefined,
      currentCueId: undefined,
      provisionalVote: 'unable-to-agree',
      secondVote: 'unable-to-agree',
      finalVote: 'unable-to-agree',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: true,
      sealedVerdict: 'unable-to-agree',
      sealedAgreement: 'hung',
      openCourtVerdictReturned: true,
      returnedVerdict: 'unable-to-agree',
      returnedAgreement: 'hung',
      reasoningContributions: [],
    }
    const withoutNotes = importWeeklyProgress(
      exportWeeklyProgress(deliberated),
      'cw-0001',
      '2026.08.03-r2',
      elevenMinutesDeliberation,
      elevenMinutesCourtWeek.manifest.sessions,
    )
    expect(withoutNotes).toEqual({ ...deliberated, notes: '' })
    expect(importWeeklyProgress(
      exportWeeklyProgress(deliberated, true),
      'cw-0001',
      '2026.08.03-r2',
      elevenMinutesDeliberation,
      elevenMinutesCourtWeek.manifest.sessions,
    )).toEqual(deliberated)
  })

  it('fails closed on fresh-ballot state unless the revised journey records its failed result', () => {
    const revised = withDeveloperFreshUnanimityBallot(elevenMinutesCourtWeek)
    const sessions = revised.manifest.sessions
    const sunday = sessions[6]
    const majority = sunday.scenes.find(({ id }) => id === 'sun-majority')!
    const atMajority: StoredWeeklyProgress = {
      ...progress,
      revision: revised.manifest.revision,
      completedSessionIds: sessions.slice(0, 6).map(({ id }) => id),
      currentSessionId: sunday.id,
      currentSceneId: majority.id,
      currentCueId: majority.cues[0].id,
      provisionalVote: 'unable-to-agree',
      secondVote: 'unable-to-agree',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: false,
      reasoningContributions: [],
    }
    const transfer = (candidate: StoredWeeklyProgress, candidateSessions = sessions) => importWeeklyProgress(
      exportWeeklyProgress(candidate), 'cw-0001', revised.manifest.revision,
      elevenMinutesDeliberation, candidateSessions,
    )

    expect(() => transfer(atMajority)).toThrow(/impossible Court Week chronology/i)
    const valid = {
      ...atMajority,
      freshUnanimityVote: 'unable-to-agree' as const,
      freshBallotWasUnanimous: false,
    }
    expect(transfer(valid)).toEqual({ ...valid, notes: '' })
    expect(() => transfer(valid, elevenMinutesCourtWeek.manifest.sessions))
      .toThrow(/impossible Court Week chronology/i)
    expect(() => transfer({ ...valid, freshBallotWasUnanimous: true }))
      .toThrow(/impossible Court Week chronology/i)

    const verdict = sunday.scenes.find(({ id }) => id === 'sun-verdict')!
    const directUnanimous = {
      ...atMajority,
      currentSceneId: verdict.id,
      currentCueId: verdict.cues[0].id,
      freshUnanimityVote: 'murder' as const,
      freshBallotWasUnanimous: true,
      sealedVerdict: 'murder' as const,
      sealedAgreement: 'unanimous' as const,
    }
    const unanimousDeliberation = {
      ...elevenMinutesDeliberation,
      firstBallot: { murder: 11, manslaughter: 0, 'not-guilty': 0, 'unable-to-agree': 0 },
    }
    expect(importWeeklyProgress(
      exportWeeklyProgress(directUnanimous), 'cw-0001', revised.manifest.revision,
      unanimousDeliberation, sessions,
    )).toEqual({ ...directUnanimous, notes: '' })

    const secondBallotUnanimous = {
      ...directUnanimous,
      secondVote: 'murder' as const,
      secondBallotWasUnanimous: true,
      freshUnanimityVote: undefined,
      freshBallotWasUnanimous: undefined,
    }
    for (const impossible of [
      { ...secondBallotUnanimous, freshUnanimityVote: 'murder' as const, freshBallotWasUnanimous: true },
      { ...secondBallotUnanimous, majorityDirectionReceived: true },
      { ...secondBallotUnanimous, finalVote: 'murder' as const },
    ]) {
      expect(() => importWeeklyProgress(
        exportWeeklyProgress(impossible), 'cw-0001', revised.manifest.revision,
        unanimousDeliberation, sessions,
      )).toThrow(/impossible Court Week chronology/i)
    }
  })

  it('rejects forged Tuesday verdict state and Sunday analysis before open-court return', () => {
    const sessions = elevenMinutesCourtWeek.manifest.sessions
    const tuesday = sessions[1]
    const forgedTuesday: StoredWeeklyProgress = {
      ...progress,
      completedSessionIds: [sessions[0].id],
      currentSessionId: tuesday.id,
      currentSceneId: tuesday.scenes[0].id,
      currentCueId: tuesday.scenes[0].cues[0].id,
      sealedVerdict: 'murder',
      sealedAgreement: 'unanimous',
      openCourtVerdictReturned: true,
      returnedVerdict: 'murder',
      returnedAgreement: 'unanimous',
    }
    const analysis = sessions[6].scenes.find(({ id }) => id === 'sun-analysis')!
    const forgedAnalysis: StoredWeeklyProgress = {
      ...progress,
      completedSessionIds: sessions.slice(0, 6).map(({ id }) => id),
      currentSessionId: sessions[6].id,
      currentSceneId: analysis.id,
      currentCueId: analysis.cues[0].id,
      provisionalVote: 'unable-to-agree',
      secondVote: 'unable-to-agree',
      finalVote: 'unable-to-agree',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: true,
      sealedVerdict: 'unable-to-agree',
      sealedAgreement: 'hung',
      returnedVerdict: 'unable-to-agree',
      returnedAgreement: 'hung',
    }
    for (const forged of [forgedTuesday, forgedAnalysis]) {
      expect(() => importWeeklyProgress(
        exportWeeklyProgress(forged), 'cw-0001', '2026.08.03-r2',
        elevenMinutesDeliberation, sessions,
      )).toThrow(/impossible Court Week chronology/i)
    }
  })

  it('rejects an old revision before interpreting forged milestones', () => {
    expect(() => importWeeklyProgress(
      exportWeeklyProgress({ ...progress, openCourtVerdictReturned: true }),
      'cw-0001', '2026.08.03-r1', elevenMinutesDeliberation,
      elevenMinutesCourtWeek.manifest.sessions,
    )).toThrow(/different case revision/i)
  })

  it('rejects progress from a different case revision', () => {
    expect(() => importWeeklyProgress(
      exportWeeklyProgress(progress, true),
      'cw-0001',
      '2026.08.03-r1',
    )).toThrow('different case revision')
  })

  it('does not let an older import roll back the highest observed court time', () => {
    const imported = {
      ...progress,
      highestObservedTime: '2026-08-10T08:30:00+10:00',
      completedSessionIds: [],
    }
    const current = {
      ...progress,
      highestObservedTime: '2026-08-12T08:30:00+10:00',
    }

    expect(mergeImportedWeeklyProgress(current, imported)).toEqual({
      ...imported,
      highestObservedTime: '2026-08-11T22:30:00.000Z',
    })
    expect(mergeImportedWeeklyProgress(imported, current)).toEqual({
      ...current,
      highestObservedTime: '2026-08-11T22:30:00.000Z',
    })
  })

  it('rejects forged or duplicated reasoning outside the authored journey', () => {
    const contribution = {
      propositionId: 'prop-causation-window-doubt',
      sceneId: 'sat-room',
      legalQuestion: 'Did that omission substantially and operatively cause Ilan Saye’s death beyond reasonable doubt?',
      evidenceId: 'ex-survival',
      move: 'challenge-inference' as const,
      recordedAt: '2026-08-15T10:00:00+10:00',
      influencePenalty: 0,
    }
    const forged: StoredWeeklyProgress = {
      ...progress,
      reasoningContributions: [{ ...contribution, sceneId: 'mon-arrival' }],
    }
    const duplicated: StoredWeeklyProgress = {
      ...progress,
      reasoningContributions: [contribution, { ...contribution, recordedAt: '2026-08-15T10:01:00+10:00' }],
    }

    expect(() => importWeeklyProgress(
      exportWeeklyProgress(forged), 'cw-0001', '2026.08.03-r2', elevenMinutesDeliberation,
    )).toThrow('outside the authored Court Week journey')
    expect(() => importWeeklyProgress(
      exportWeeklyProgress(duplicated), 'cw-0001', '2026.08.03-r2', elevenMinutesDeliberation,
    )).toThrow('outside the authored Court Week journey')

    expect(() => importWeeklyProgress(exportWeeklyProgress({
      ...progress,
      reasoningContributions: [{ ...contribution, propositionId: 'prop-unknown' }],
    }), 'cw-0001', '2026.08.03-r2', elevenMinutesDeliberation)).toThrow('outside the authored Court Week journey')
    expect(() => importWeeklyProgress(exportWeeklyProgress({
      ...progress,
      reasoningContributions: [{ ...contribution, evidenceId: 'ex-warning' }],
    }), 'cw-0001', '2026.08.03-r2', elevenMinutesDeliberation)).toThrow('outside the authored Court Week journey')

    expect(() => importWeeklyProgress(
      exportWeeklyProgress({ ...progress, reasoningContributions: [contribution] }),
      'cw-0001',
      '2026.08.03-r2',
    )).toThrow(/after the Saturday session has opened/i)
  })
})
