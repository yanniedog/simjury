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
  version: 1,
} as const

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

export type ProgressLoadResult = {
  progress: StoredWeeklyProgress | null
  issue: 'unavailable' | 'corrupt' | null
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

function openProgressDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROGRESS_DATABASE.name, PROGRESS_DATABASE.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROGRESS_DATABASE.store)) {
        request.result.createObjectStore(PROGRESS_DATABASE.store)
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
): Promise<StoredWeeklyProgress | null> {
  return (await loadWeeklyProgressResult(caseId)).progress
}

export async function loadWeeklyProgressResult(caseId: string): Promise<ProgressLoadResult> {
  if (!hasIndexedDb()) {
    return { progress: memoryProgress.get(caseId) ?? null, issue: 'unavailable' }
  }
  try {
    const storedValue = await withStore<unknown>(
      'readonly',
      (store) => store.get(caseId),
    )
    const stored = validateStoredProgress(storedValue)
    if (stored) memoryProgress.set(caseId, stored)
    return {
      progress: stored ?? memoryProgress.get(caseId) ?? null,
      issue: storedValue != null && !stored ? 'corrupt' : null,
    }
  } catch {
    return { progress: memoryProgress.get(caseId) ?? null, issue: 'unavailable' }
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
  deliberation?: DeliberationPack,
  sessions?: CourtSession[],
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

export function mergeImportedWeeklyProgress(
  current: StoredWeeklyProgress,
  imported: StoredWeeklyProgress,
): StoredWeeklyProgress {
  return {
    ...imported,
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
  link.download = `${progress.courtWeekId}-progress.simjury-progress.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function clearMemoryProgressForTests(): void {
  memoryProgress.clear()
}
