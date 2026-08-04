import { weeklyProgressSchema, type WeeklyProgress } from '../model/schema'
import { hasValidContributionJourney } from '../model/deliberationContract'

const DATABASE = 'simjury-court-week-v1'
const STORE = 'progress'
const DATABASE_VERSION = 1

export const PROGRESS_FORMAT = 'simjury-court-week-progress-v1' as const

export type AccessMode = 'audio-first' | 'captions' | 'reading'

export type StoredWeeklyProgress = WeeklyProgress & {
  accessibilityMode?: AccessMode
}

export interface ProgressEnvelope {
  format: typeof PROGRESS_FORMAT
  exportedAt: string
  progress: StoredWeeklyProgress
}

const memoryProgress = new Map<string, StoredWeeklyProgress>()

function validateStoredProgress(value: unknown): StoredWeeklyProgress | null {
  const validated = weeklyProgressSchema.safeParse(value)
  if (!validated.success) return null
  const mode = (value as StoredWeeklyProgress).accessibilityMode
  return {
    ...validated.data,
    ...(mode === 'audio-first' || mode === 'captions' || mode === 'reading'
      ? { accessibilityMode: mode }
      : {}),
  }
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openProgressDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openProgressDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = operation(transaction.objectStore(STORE))
      let result!: T
      let requestSucceeded = false
      const rejectTransaction = () => reject(
        transaction.error ?? request.error ?? new Error('IndexedDB transaction failed.'),
      )
      request.onerror = rejectTransaction
      request.onsuccess = () => {
        result = request.result
        requestSucceeded = true
      }
      transaction.onerror = rejectTransaction
      transaction.onabort = rejectTransaction
      transaction.oncomplete = () => {
        if (requestSucceeded) resolve(result)
        else reject(new Error('IndexedDB transaction completed without a request result.'))
      }
    })
  } finally {
    database.close()
  }
}

export async function loadWeeklyProgress(
  caseId: string,
): Promise<StoredWeeklyProgress | null> {
  if (!hasIndexedDb()) return memoryProgress.get(caseId) ?? null
  try {
    const storedValue = await withStore<unknown>(
      'readonly',
      (store) => store.get(caseId),
    )
    const stored = validateStoredProgress(storedValue)
    if (stored) memoryProgress.set(caseId, stored)
    return stored ?? memoryProgress.get(caseId) ?? null
  } catch {
    return memoryProgress.get(caseId) ?? null
  }
}

export async function saveWeeklyProgress(
  caseId: string,
  progress: StoredWeeklyProgress,
): Promise<'indexeddb' | 'memory'> {
  memoryProgress.set(caseId, progress)
  if (!hasIndexedDb()) return 'memory'
  try {
    await withStore('readwrite', (store) => store.put(progress, caseId))
    return 'indexeddb'
  } catch {
    return 'memory'
  }
}

export function exportWeeklyProgress(
  progress: StoredWeeklyProgress,
  includePrivateNotes = false,
): string {
  const exportedProgress = includePrivateNotes
    ? progress
    : { ...progress, notes: '' }
  const envelope: ProgressEnvelope = {
    format: PROGRESS_FORMAT,
    exportedAt: new Date().toISOString(),
    progress: exportedProgress,
  }
  return JSON.stringify(envelope, null, 2)
}

export function importWeeklyProgress(
  text: string,
  expectedCaseId: string,
  expectedRevision: string,
): StoredWeeklyProgress {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('This is not a SimJury progress file.')
  }
  const envelope = parsed as Partial<ProgressEnvelope>
  if (envelope.format !== PROGRESS_FORMAT || !envelope.progress) {
    throw new Error('This progress file uses an unsupported format.')
  }
  const validated = validateStoredProgress(envelope.progress)
  if (!validated) {
    throw new Error('This progress file is damaged or incomplete.')
  }
  if (validated.courtWeekId !== expectedCaseId) {
    throw new Error('This progress belongs to a different case.')
  }
  if (validated.revision !== expectedRevision) {
    throw new Error('This progress belongs to a different case revision.')
  }
  if (!hasValidContributionJourney(validated.reasoningContributions ?? [])) {
    throw new Error('This progress contains reasoning outside the authored Court Week journey.')
  }
  return validated
}

export function downloadWeeklyProgress(
  progress: StoredWeeklyProgress,
  includePrivateNotes = false,
): void {
  const blob = new Blob([exportWeeklyProgress(progress, includePrivateNotes)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${progress.courtWeekId}-progress.simjury-progress.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function clearMemoryProgressForTests(): void {
  memoryProgress.clear()
}
