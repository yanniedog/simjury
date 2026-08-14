import { courtDayPackSchema } from './packSchema'
import type { CourtDayPack } from './types'
import {
  openProgressDatabase,
  PROGRESS_DATABASE,
  PROGRESS_PACK_STORE,
  rememberWeeklyProgress,
  weeklyProgressStorageKey,
  type StoredWeeklyProgress,
} from '../state/progress'

const LEGACY_DATABASE = 'simjury-court-week-sealed-v1'
const LEGACY_STORE = 'opened-packs'
const LEGACY_VERSION = 1

const memoryPacks = new Map<string, CourtDayPack>()

export function openedPackStorageKey(caseId: string, revision: string, releaseTag: string, ordinal: number) {
  return `${caseId}:${revision}:${releaseTag}:${ordinal}`
}

function openLegacyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE, LEGACY_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LEGACY_STORE)) {
        request.result.createObjectStore(LEGACY_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function readStore(database: IDBDatabase, store: string, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, 'readonly')
    const request = transaction.objectStore(store).get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function readIndexed(key: string): Promise<{ value: unknown; legacy: boolean }> {
  try {
    const database = await openProgressDatabase()
    try {
      const current = await readStore(database, PROGRESS_PACK_STORE, key)
      if (current != null) return { value: current, legacy: false }
    } finally { database.close() }
  } catch { /* A legacy cache may still be available during an upgrade block. */ }
  const legacy = await openLegacyDatabase()
  try { return { value: await readStore(legacy, LEGACY_STORE, key), legacy: true } } finally { legacy.close() }
}

async function writeIndexed(key: string, pack: CourtDayPack): Promise<void> {
  const database = await openProgressDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROGRESS_PACK_STORE, 'readwrite')
      transaction.objectStore(PROGRESS_PACK_STORE).put(pack, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function loadOpenedPack(
  caseId: string,
  revision: string,
  releaseTag: string,
  ordinal: number,
  memoize = true,
): Promise<CourtDayPack | null> {
  const key = openedPackStorageKey(caseId, revision, releaseTag, ordinal)
  const memory = memoryPacks.get(key)
  if (memory) return memory
  if (typeof indexedDB === 'undefined') return null
  try {
    const stored = await readIndexed(key)
    const parsed = courtDayPackSchema.safeParse(stored.value)
    if (!parsed.success) return null
    if (stored.legacy) {
      try { await writeIndexed(key, parsed.data) } catch { /* Preserve the readable legacy copy. */ }
    }
    if (memoize) memoryPacks.set(key, parsed.data)
    return parsed.data
  } catch {
    return null
  }
}

export async function saveOpenedPack(pack: CourtDayPack, releaseTag: string): Promise<void> {
  const key = openedPackStorageKey(pack.caseId, pack.revision, releaseTag, pack.ordinal)
  memoryPacks.set(key, pack)
  if (typeof indexedDB === 'undefined') return
  try {
    await writeIndexed(key, pack)
  } catch {
    // The opened session remains playable in memory when private storage is blocked.
  }
}

function assertImportedPackIdentity(packs: CourtDayPack[], progress: StoredWeeklyProgress): void {
  const ordinals = new Set<number>()
  for (const pack of packs) {
    if (
      pack.caseId !== progress.courtWeekId ||
      pack.revision !== progress.revision ||
      ordinals.has(pack.ordinal)
    ) throw new Error('The imported packs do not match one unique Court Week revision.')
    ordinals.add(pack.ordinal)
  }
}

export async function writeImportedCourtWeek(
  database: IDBDatabase,
  packs: CourtDayPack[],
  releaseTag: string,
  progress: StoredWeeklyProgress,
): Promise<void> {
  assertImportedPackIdentity(packs, progress)
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([PROGRESS_DATABASE.store, PROGRESS_PACK_STORE], 'readwrite')
    const fail = () => reject(transaction.error ?? new Error('The import transaction did not complete.'))
    for (const pack of packs) {
      transaction.objectStore(PROGRESS_PACK_STORE).put(
        pack,
        openedPackStorageKey(pack.caseId, pack.revision, releaseTag, pack.ordinal),
      )
    }
    transaction.objectStore(PROGRESS_DATABASE.store).put(
      progress,
      weeklyProgressStorageKey(progress.courtWeekId, progress.revision),
    )
    transaction.onerror = fail
    transaction.onabort = fail
    transaction.oncomplete = () => resolve()
  })
}

export async function commitImportedCourtWeek(
  packs: CourtDayPack[],
  releaseTag: string,
  progress: StoredWeeklyProgress,
): Promise<'indexeddb' | 'memory'> {
  assertImportedPackIdentity(packs, progress)
  if (typeof indexedDB === 'undefined') {
    for (const pack of packs) memoryPacks.set(
      openedPackStorageKey(pack.caseId, pack.revision, releaseTag, pack.ordinal),
      pack,
    )
    rememberWeeklyProgress(progress)
    return 'memory'
  }
  const database = await openProgressDatabase()
  try { await writeImportedCourtWeek(database, packs, releaseTag, progress) } finally { database.close() }
  for (const pack of packs) memoryPacks.set(
    openedPackStorageKey(pack.caseId, pack.revision, releaseTag, pack.ordinal),
    pack,
  )
  rememberWeeklyProgress(progress)
  return 'indexeddb'
}

export function clearOpenedPackMemoryForTests(): void {
  memoryPacks.clear()
}
