import { beforeEach, describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import type { StoredWeeklyProgress } from '../state/progress'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'
import {
  clearOpenedPackMemoryForTests,
  loadOpenedPack,
  saveOpenedPack,
  writeImportedCourtWeek,
} from './packStore'

const mondayPack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]
const importedProgress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: mondayPack.caseId,
  revision: mondayPack.revision,
  highestObservedTime: '2026-08-10T08:30:00+10:00',
  completedSessionIds: [],
  currentSessionId: mondayPack.session.id,
  currentSceneId: mondayPack.session.scenes[0].id,
  currentCueId: mondayPack.session.scenes[0].cues[0].id,
  notes: '',
}

describe('opened sealed-pack cache', () => {
  beforeEach(() => clearOpenedPackMemoryForTests())

  it('does not reuse a pack from a different immutable media release', async () => {
    const priorReleaseTag = 'court-week-cw-0001-2026.08.03-r2'
    await saveOpenedPack(mondayPack, priorReleaseTag)

    await expect(loadOpenedPack(
      mondayPack.caseId,
      mondayPack.revision,
      priorReleaseTag,
      mondayPack.ordinal,
    )).resolves.toEqual(mondayPack)
    await expect(loadOpenedPack(
      mondayPack.caseId,
      mondayPack.revision,
      courtWeekBootstrap.releaseTag,
      mondayPack.ordinal,
    )).resolves.toBeNull()
  })

  it('writes imported packs and progress through one transaction', async () => {
    const writes: Array<{ store: string; key: IDBValidKey }> = []
    const transaction = {
      error: null,
      objectStore: (store: string) => ({
        put: (_value: unknown, key: IDBValidKey) => { writes.push({ store, key }) },
      }),
    } as unknown as IDBTransaction
    const database = {
      transaction: vi.fn((stores: string[], mode: IDBTransactionMode) => {
        expect(stores).toEqual(['progress', 'opened-packs'])
        expect(mode).toBe('readwrite')
        queueMicrotask(() => transaction.oncomplete?.({} as Event))
        return transaction
      }),
    } as unknown as IDBDatabase

    await writeImportedCourtWeek(database, [mondayPack], courtWeekBootstrap.releaseTag, importedProgress)

    expect(writes.map(({ store }) => store)).toEqual(['opened-packs', 'progress'])
    expect(writes[1].key).toEqual([mondayPack.caseId, mondayPack.revision])
  })

  it('rejects an aborted import transaction and mismatched packs', async () => {
    const transaction = {
      error: new DOMException('Storage quota exhausted.', 'QuotaExceededError'),
      objectStore: () => ({ put: () => undefined }),
    } as unknown as IDBTransaction
    const database = {
      transaction: vi.fn(() => {
        queueMicrotask(() => transaction.onabort?.({} as Event))
        return transaction
      }),
    } as unknown as IDBDatabase
    await expect(writeImportedCourtWeek(
      database, [mondayPack], courtWeekBootstrap.releaseTag, importedProgress,
    )).rejects.toThrow('Storage quota exhausted')

    await expect(writeImportedCourtWeek(
      database,
      [{ ...mondayPack, revision: 'forged-revision' }],
      courtWeekBootstrap.releaseTag,
      importedProgress,
    )).rejects.toThrow('do not match one unique Court Week revision')
    expect(database.transaction).toHaveBeenCalledTimes(1)
  })
})
