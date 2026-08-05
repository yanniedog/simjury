import {
  importWeeklyProgress,
  parseWeeklyProgressExport,
  type StoredWeeklyProgress,
} from '../state/progress'
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
): CourtWeekScheduleEntry[] {
  const fail = (): never => { throw new Error('This progress contains an impossible Court Week chronology.') }
  const completed = candidate.completedSessionIds
  const expectedPrefix = bootstrap.sessions.slice(0, completed.length).map(({ id }) => id)
  if (new Set(completed).size !== completed.length || JSON.stringify(completed) !== JSON.stringify(expectedPrefix)) fail()

  const current = completed.length < bootstrap.sessions.length
    ? bootstrap.sessions[completed.length]
    : undefined
  if (current && candidate.currentSessionId !== current.id) fail()
  if (completed.length > bootstrap.sessions.length) fail()

  const entries = bootstrap.sessions.slice(0, completed.length + (current ? 1 : 0))
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
  hydrate = hydrateCourtPacks,
}: {
  text: string
  bootstrap: CourtWeekBootstrap
  currentProgress: StoredWeeklyProgress
  observedNow: number
  baseUrl: string
  fetcher?: SealedPackFetcher
  hydrate?: ImportPackHydrator
}): Promise<{ progress: StoredWeeklyProgress; packs: CourtDayPack[] }> {
  const candidate = parseWeeklyProgressExport(text, bootstrap.id, bootstrap.revision)
  const entries = requiredImportEntries(bootstrap, candidate, observedNow)
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
  const exact = importWeeklyProgress(
    text,
    bootstrap.id,
    bootstrap.revision,
    deliberation,
    packs.map((pack) => pack.session),
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
