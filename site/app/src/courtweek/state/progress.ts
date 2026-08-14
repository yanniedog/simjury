import {
  weeklyProgressSchema,
  type CourtSession,
  type DeliberationPack,
  type WeeklyProgress,
} from '../model/schema'
import { hasValidContributionJourney } from '../model/deliberationContract'
import { calculateFinalBallot, calculateSecondBallot, unanimousVerdict } from '../engine/deliberation'

export const PROGRESS_DATABASE = {
  name: 'simjury-court-week-v1',
  store: 'progress',
  version: 2,
} as const
export const PROGRESS_PACK_STORE = 'opened-packs' as const

export const PROGRESS_FORMAT = 'simjury-court-week-progress-v1' as const
export const MAX_PROGRESS_TRANSFER_BYTES = 1024 * 1024

export type AccessMode = 'audio-first' | 'captions' | 'reading'

export type StoredWeeklyProgress = WeeklyProgress & {
  accessibilityMode?: AccessMode
}

export interface ProgressEnvelope {
  format: typeof PROGRESS_FORMAT
  exportedAt: string
  progress: StoredWeeklyProgress
}

export type ProgressLoadResult = {
  progress: StoredWeeklyProgress | null
  archives: StoredWeeklyProgress[]
  issue: 'unavailable' | 'corrupt' | 'revision-mismatch' | null
}

const memoryProgress = new Map<string, StoredWeeklyProgress>()

export function weeklyProgressStorageKey(caseId: string, revision: string): [string, string] {
  return [caseId, revision]
}

function memoryStorageKey(caseId: string, revision: string): string {
  return JSON.stringify(weeklyProgressStorageKey(caseId, revision))
}

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

function assertImportChronology(
  progress: StoredWeeklyProgress,
  sessions: CourtSession[],
  deliberation?: DeliberationPack,
): void {
  const fail = (): never => { throw new Error('This progress contains an impossible Court Week chronology.') }
  const completed = progress.completedSessionIds
  const expectedPrefix = sessions.slice(0, completed.length).map(({ id }) => id)
  if (new Set(completed).size !== completed.length || JSON.stringify(completed) !== JSON.stringify(expectedPrefix)) fail()

  const positionParts = [progress.currentSessionId, progress.currentSceneId, progress.currentCueId]
  if (positionParts.some(Boolean) && !positionParts.every(Boolean)) fail()
  const currentSession = sessions.find(({ id }) => id === progress.currentSessionId)
  const currentScene = currentSession?.scenes.find(({ id }) => id === progress.currentSceneId)
  const currentCue = currentScene?.cues.find(({ id }) => id === progress.currentCueId)
  if (positionParts.every(Boolean) && (!currentSession || !currentScene || !currentCue)) fail()
  if (completed.length < sessions.length) {
    if (!currentSession || currentSession.id !== sessions[completed.length]?.id) fail()
  } else if (completed.length > sessions.length) fail()

  const orderedCues = sessions.flatMap((session) => session.scenes.flatMap((scene) => (
    scene.cues.map((cue) => ({ sessionId: session.id, sceneId: scene.id, cueId: cue.id }))
  )))
  const currentIndex = completed.length === sessions.length
    ? Number.POSITIVE_INFINITY
    : orderedCues.findIndex(({ sessionId, sceneId, cueId }) => (
        sessionId === progress.currentSessionId && sceneId === progress.currentSceneId && cueId === progress.currentCueId
      ))
  const sceneIndex = (sceneId: string) => orderedCues.findIndex((cue) => cue.sceneId === sceneId)
  const cueIndex = (cueId: string) => orderedCues.findIndex((cue) => cue.cueId === cueId)
  const atOrAfterScene = (sceneId: string) => sceneIndex(sceneId) >= 0 && currentIndex >= sceneIndex(sceneId)
  const afterCue = (cueId: string) => cueIndex(cueId) >= 0 && currentIndex > cueIndex(cueId)

  if (progress.provisionalVote && !atOrAfterScene('sat-provisional')) fail()
  if (progress.secondVote && (!progress.provisionalVote || !atOrAfterScene('sun-second-ballot'))) fail()
  if (progress.finalVote && (!progress.secondVote || !atOrAfterScene('sun-final-ballot'))) fail()
  if (atOrAfterScene('sat-first-ballot') && !progress.provisionalVote) fail()
  if (atOrAfterScene('sun-persevere') && !progress.secondVote) fail()
  if (atOrAfterScene('sun-final-ballot') && !progress.secondBallotWasUnanimous && !progress.majorityDirectionReceived) fail()
  if (progress.majorityDirectionReceived && !afterCue('sun-majority-direction')) fail()

  const sealedPair = Boolean(progress.sealedVerdict) === Boolean(progress.sealedAgreement)
  const returnedPair = Boolean(progress.returnedVerdict) === Boolean(progress.returnedAgreement)
  if (!sealedPair || !returnedPair) fail()
  if (progress.secondVote) {
    if (!deliberation) throw new Error('This progress contains an impossible Court Week chronology.')
    if (progress.secondBallotWasUnanimous === undefined) fail()
    const secondResult = unanimousVerdict(calculateSecondBallot(
      deliberation, progress.secondVote, progress.reasoningContributions ?? [],
    ))
    if (Boolean(secondResult) !== progress.secondBallotWasUnanimous) fail()
    if (secondResult && (progress.sealedVerdict !== secondResult || progress.sealedAgreement !== 'unanimous')) fail()
  }
  if (progress.finalVote) {
    if (!deliberation) throw new Error('This progress contains an impossible Court Week chronology.')
    const finalResult = calculateFinalBallot({
      pack: deliberation,
      secondVote: progress.secondVote!,
      finalVote: progress.finalVote,
      contributions: progress.reasoningContributions ?? [],
      secondBallotWasUnanimous: progress.secondBallotWasUnanimous ?? false,
      majorityDirectionReceived: progress.majorityDirectionReceived ?? false,
      elapsedCourtHours: 8.5,
    })
    if (progress.sealedVerdict !== finalResult.verdict || progress.sealedAgreement !== finalResult.agreement) fail()
  }
  if (atOrAfterScene('sun-verdict') && !progress.sealedVerdict) fail()
  if (progress.openCourtVerdictReturned) {
    if (
      !afterCue('sun-verdict-return') ||
      progress.returnedVerdict !== progress.sealedVerdict ||
      progress.returnedAgreement !== progress.sealedAgreement
    ) fail()
  } else if (progress.returnedVerdict || progress.returnedAgreement || atOrAfterScene('sun-analysis')) fail()
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function archivedProgress(
  values: Iterable<unknown>,
  caseId: string,
  currentRevision: string,
): StoredWeeklyProgress[] {
  const revisions = new Map<string, StoredWeeklyProgress>()
  for (const value of values) {
    const candidate = validateStoredProgress(value)
    if (!candidate || candidate.courtWeekId !== caseId || candidate.revision === currentRevision) continue
    const existing = revisions.get(candidate.revision)
    if (!existing || Date.parse(candidate.highestObservedTime) > Date.parse(existing.highestObservedTime)) {
      revisions.set(candidate.revision, candidate)
    }
  }
  return Array.from(revisions.values()).sort((left, right) =>
    Date.parse(right.highestObservedTime) - Date.parse(left.highestObservedTime)
    || right.revision.localeCompare(left.revision),
  )
}

export function openProgressDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROGRESS_DATABASE.name, PROGRESS_DATABASE.version)
    request.onerror = () => reject(request.error)
    // A pre-upgrade tab can temporarily hold the v1 connection open. Keep
    // hydration pending until that tab releases it; falling back to an empty
    // memory record here could later overwrite the genuine saved progress.
    request.onblocked = () => undefined
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROGRESS_DATABASE.store)) {
        request.result.createObjectStore(PROGRESS_DATABASE.store)
      }
      if (!request.result.objectStoreNames.contains(PROGRESS_PACK_STORE)) {
        request.result.createObjectStore(PROGRESS_PACK_STORE)
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

export function rememberWeeklyProgress(progress: StoredWeeklyProgress): void {
  memoryProgress.set(memoryStorageKey(progress.courtWeekId, progress.revision), progress)
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openProgressDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(PROGRESS_DATABASE.store, mode)
      const request = operation(transaction.objectStore(PROGRESS_DATABASE.store))
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
  revision: string,
): Promise<StoredWeeklyProgress | null> {
  return (await loadWeeklyProgressResult(caseId, revision)).progress
}

export async function loadWeeklyProgressResult(
  caseId: string,
  revision: string,
): Promise<ProgressLoadResult> {
  const key = memoryStorageKey(caseId, revision)
  const memoryArchives = () => archivedProgress(memoryProgress.values(), caseId, revision)
  const indexedArchives = async () => archivedProgress(
    await withStore<unknown[]>('readonly', (store) => store.getAll()),
    caseId,
    revision,
  )
  if (!hasIndexedDb()) {
    return { progress: memoryProgress.get(key) ?? null, archives: memoryArchives(), issue: 'unavailable' }
  }
  try {
    const storedValue = await withStore<unknown>(
      'readonly',
      (store) => store.get(weeklyProgressStorageKey(caseId, revision)),
    )
    const legacyValue = await withStore<unknown>('readonly', (store) => store.get(caseId))
    const stored = validateStoredProgress(storedValue)
    const legacy = validateStoredProgress(legacyValue)
    const corrupt = (storedValue != null && (!stored || stored.courtWeekId !== caseId || stored.revision !== revision))
      || (legacyValue != null && (!legacy || legacy.courtWeekId !== caseId))
    if (corrupt) {
      if (legacy?.courtWeekId === caseId && legacy.revision !== revision) {
        memoryProgress.set(memoryStorageKey(caseId, legacy.revision), legacy)
      }
      let archives = memoryArchives()
      try { archives = await indexedArchives() } catch { /* retain recoverable memory archives */ }
      return { progress: null, archives, issue: 'corrupt' }
    }
    const current = legacy?.revision === revision && (!stored
      || Date.parse(legacy.highestObservedTime) > Date.parse(stored.highestObservedTime)) ? legacy : stored
    if (current) memoryProgress.set(key, current)
    if (legacy && legacy.revision !== revision) {
      memoryProgress.set(memoryStorageKey(caseId, legacy.revision), legacy)
    }
    const archives = await indexedArchives()
    if (legacy) {
      const copy = legacy.revision === revision
        ? current!
        : archives.find(({ revision: archivedRevision }) => archivedRevision === legacy.revision) ?? legacy
      memoryProgress.set(memoryStorageKey(caseId, copy.revision), copy)
      // Preserve the legacy key while repairing its revision-keyed copy with
      // the newest record, including writes made by a pre-deploy tab.
      await withStore('readwrite', (store) => store.put(copy, weeklyProgressStorageKey(caseId, copy.revision)))
    }
    for (const archive of archives) {
      memoryProgress.set(memoryStorageKey(caseId, archive.revision), archive)
    }
    return {
      progress: current ?? memoryProgress.get(key) ?? null,
      archives,
      issue: !current && archives.length > 0 ? 'revision-mismatch' : null,
    }
  } catch {
    return { progress: memoryProgress.get(key) ?? null, archives: memoryArchives(), issue: 'unavailable' }
  }
}

export async function saveWeeklyProgress(
  caseId: string,
  progress: StoredWeeklyProgress,
): Promise<'indexeddb' | 'memory'> {
  if (progress.courtWeekId !== caseId) throw new Error('Progress case identity does not match its storage key.')
  rememberWeeklyProgress(progress)
  if (!hasIndexedDb()) return 'memory'
  try {
    await withStore('readwrite', (store) => store.put(
      progress,
      weeklyProgressStorageKey(caseId, progress.revision),
    ))
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
  const serialized = JSON.stringify(envelope, null, 2)
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROGRESS_TRANSFER_BYTES) {
    throw new Error('Progress is too large to transfer. Shorten your private notes before exporting.')
  }
  return serialized
}

export function importWeeklyProgress(
  text: string,
  expectedCaseId: string,
  expectedRevision: string,
  deliberation?: DeliberationPack,
  sessions?: CourtSession[],
): StoredWeeklyProgress {
  const validated = parseWeeklyProgressExport(text, expectedCaseId, expectedRevision)
  const contributions = validated.reasoningContributions ?? []
  if (contributions.length > 0 && !deliberation?.propositions) {
    throw new Error('Deliberation progress can be imported after the Saturday session has opened.')
  }
  if (deliberation && !hasValidContributionJourney(contributions, deliberation)) {
    throw new Error('This progress contains reasoning outside the authored Court Week journey.')
  }
  if (sessions) assertImportChronology(validated, sessions, deliberation)
  return validated
}

/** Parse identity and schema only; sealed imports run exact chronology after hydrating eligible packs. */
export function parseWeeklyProgressExport(
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
  return validated
}

export function mergeImportedWeeklyProgress(
  current: StoredWeeklyProgress,
  imported: StoredWeeklyProgress,
): StoredWeeklyProgress {
  return {
    ...imported,
    notes: imported.notes || current.notes,
    highestObservedTime: new Date(Math.max(
      Date.parse(current.highestObservedTime),
      Date.parse(imported.highestObservedTime),
    )).toISOString(),
  }
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
  link.download = `${progress.courtWeekId}-${progress.revision}-progress.simjury-progress.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function clearMemoryProgressForTests(): void {
  memoryProgress.clear()
}
