import {
  importWeeklyProgress,
  parseWeeklyProgressExport,
  type StoredWeeklyProgress,
} from '../state/progress'
import type { CourtSession } from '../model/schema'
import { hydrateCourtPacks, type SealedPackFetcher } from './loader'
import type { CourtDayPack, CourtWeekBootstrap, CourtWeekScheduleEntry } from './types'

export type ImportPackHydrator = (input: {
  bootstrap: CourtWeekBootstrap
  entries: CourtWeekScheduleEntry[]
  baseUrl: string
  fetcher?: SealedPackFetcher
  persistOpened: false
}) => Promise<CourtDayPack[]>

export function requiredImportEntries(
  bootstrap: CourtWeekBootstrap,
  candidate: StoredWeeklyProgress,
  observedNow: number,
  includeCurrent = true,
): CourtWeekScheduleEntry[] {
  const fail = (): never => { throw new Error('This progress contains an impossible Court Week chronology.') }
  const completed = candidate.completedSessionIds
  const expectedPrefix = bootstrap.sessions.slice(0, completed.length).map(({ id }) => id)
  const isExactPrefix = completed.length === expectedPrefix.length
    && completed.every((id, index) => id === expectedPrefix[index])
  if (new Set(completed).size !== completed.length || !isExactPrefix) fail()

  const current = completed.length < bootstrap.sessions.length
    ? bootstrap.sessions[completed.length]
    : undefined
  if (current && candidate.currentSessionId !== current.id) fail()
  if (completed.length > bootstrap.sessions.length) fail()

  const entries = bootstrap.sessions.slice(0, completed.length + (current && includeCurrent ? 1 : 0))
  const completedSet = new Set(completed)
  for (const entry of entries) {
    const unlockAt = Date.parse(entry.unlockAt)
    if (!Number.isFinite(unlockAt) || observedNow < unlockAt) {
      throw new Error(`${entry.day} remains sealed until its scheduled court time.`)
    }
    if (entry.prerequisiteSessionIds.some((id) => !completedSet.has(id))) fail()
  }
  return entries
}

/**
 * Prepare a sealed import without mutating progress or the opened-pack cache.
 * Only the local clock and the claimed sequential prefix select packs; the
 * export's clock watermark is ignored until exact hydrated validation passes.
 */
export async function prepareSealedProgressImport({
  text,
  bootstrap,
  currentProgress,
  observedNow,
  baseUrl,
  fetcher,
  sealedSessions = [],
  hydrate = hydrateCourtPacks,
}: {
  text: string
  bootstrap: CourtWeekBootstrap
  currentProgress: StoredWeeklyProgress
  observedNow: number
  baseUrl: string
  fetcher?: SealedPackFetcher
  sealedSessions?: CourtSession[]
  hydrate?: ImportPackHydrator
}): Promise<{ progress: StoredWeeklyProgress; packs: CourtDayPack[] }> {
  const candidate = parseWeeklyProgressExport(text, bootstrap.id, bootstrap.revision)
  const boundarySession = sealedSessions.find((session) => (
    session.id === candidate.currentSessionId
    && session.prerequisiteSessionIds.includes(`sealed:${session.id}`)
    && session.scenes.some((scene) => (
      scene.id === candidate.currentSceneId
      && scene.cues.some((cue) => cue.id === candidate.currentCueId)
    ))
  ))
  const entries = requiredImportEntries(bootstrap, candidate, observedNow, !boundarySession)
  const packs = await hydrate({
    bootstrap,
    entries,
    baseUrl,
    ...(fetcher ? { fetcher } : {}),
    persistOpened: false,
  })
  if (
    packs.length !== entries.length ||
    packs.some((pack, index) => pack.ordinal !== entries[index].ordinal)
  ) {
    throw new Error('The imported Court Week record could not be hydrated completely.')
  }
  const deliberation = packs.find((pack) => pack.deliberation)?.deliberation
  const validationSessions = packs.map((pack) => pack.session)
  if (boundarySession) validationSessions.push(boundarySession)
  const exact = importWeeklyProgress(
    text,
    bootstrap.id,
    bootstrap.revision,
    deliberation,
    validationSessions,
  )
  const currentWatermark = Date.parse(currentProgress.highestObservedTime)
  return {
    progress: {
      ...exact,
      highestObservedTime: new Date(Math.max(
        Number.isFinite(currentWatermark) ? currentWatermark : observedNow,
        observedNow,
      )).toISOString(),
    },
    packs,
  }
}
