import type { StoredWeeklyProgress } from '../state/progress'
import { getSessionAvailability } from '../state/schedule'
import { decryptCourtDayPack } from './crypto'
import { loadOpenedPack, saveOpenedPack } from './packStore'
import type {
  CourtDayPack,
  CourtWeekBootstrap,
  CourtWeekScheduleEntry,
} from './types'

export type SealedPackFetcher = (url: string) => Promise<Response>

export function eligibleScheduleEntries(
  bootstrap: CourtWeekBootstrap,
  progress: StoredWeeklyProgress,
  observedNow: number,
): CourtWeekScheduleEntry[] {
  const availability = getSessionAvailability(
    bootstrap.sessions.map((session) => ({
      id: session.id,
      unlockAt: session.unlockAt,
      prerequisites: session.prerequisiteSessionIds,
    })),
    progress.completedSessionIds,
    observedNow,
  )
  return bootstrap.sessions.filter((session) => {
    const state = availability.find((item) => item.id === session.id)
    return Boolean(
      state?.unlocked &&
      (state.ready || progress.completedSessionIds.includes(session.id)),
    )
  })
}

export async function loadEligibleCourtPacks({
  bootstrap,
  progress,
  observedNow,
  baseUrl,
  fetcher = window.fetch.bind(window),
}: {
  bootstrap: CourtWeekBootstrap
  progress: StoredWeeklyProgress
  observedNow: number
  baseUrl: string
  fetcher?: SealedPackFetcher
}): Promise<CourtDayPack[]> {
  const eligible = eligibleScheduleEntries(bootstrap, progress, observedNow)
  const packs: CourtDayPack[] = []

  for (const entry of eligible) {
    const cached = await loadOpenedPack(bootstrap.id, bootstrap.revision, entry.ordinal)
    if (cached) {
      packs.push(cached)
      continue
    }

    // The second derivation half is itself code-split and requested only here,
    // after both the court clock and sequential prerequisite checks passed.
    const { loadUnlockFragment } = await import('./unlockKey')
    const unlockFragment = await loadUnlockFragment(entry.ordinal)
    const response = await fetcher(`${baseUrl}${entry.locator}`)
    if (!response.ok) throw new Error(`Session ${entry.ordinal} could not be downloaded.`)
    const pack = await decryptCourtDayPack(
      await response.json(),
      { caseId: bootstrap.id, revision: bootstrap.revision, ordinal: entry.ordinal },
      unlockFragment,
    )
    await saveOpenedPack(pack)
    packs.push(pack)
  }

  return packs.sort((left, right) => left.ordinal - right.ordinal)
}
