import { courtDayPackSchema } from './packSchema'
import type { CourtDayPack } from './types'

const DATABASE = 'simjury-court-week-sealed-v1'
const STORE = 'opened-packs'
const VERSION = 1

const memoryPacks = new Map<string, CourtDayPack>()

function cacheKey(caseId: string, revision: string, releaseTag: string, ordinal: number) {
  return `${caseId}:${revision}:${releaseTag}:${ordinal}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function readIndexed(key: string): Promise<unknown> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } finally {
    database.close()
  }
}

async function writeIndexed(key: string, pack: CourtDayPack): Promise<void> {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(pack, key)
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
  const key = cacheKey(caseId, revision, releaseTag, ordinal)
  const memory = memoryPacks.get(key)
  if (memory) return memory
  if (typeof indexedDB === 'undefined') return null
  try {
    const parsed = courtDayPackSchema.safeParse(await readIndexed(key))
    if (!parsed.success) return null
    if (memoize) memoryPacks.set(key, parsed.data)
    return parsed.data
  } catch {
    return null
  }
}

export async function saveOpenedPack(pack: CourtDayPack, releaseTag: string): Promise<void> {
  const key = cacheKey(pack.caseId, pack.revision, releaseTag, pack.ordinal)
  memoryPacks.set(key, pack)
  if (typeof indexedDB === 'undefined') return
  try {
    await writeIndexed(key, pack)
  } catch {
    // The opened session remains playable in memory when private storage is blocked.
  }
}

export function clearOpenedPackMemoryForTests(): void {
  memoryPacks.clear()
}
