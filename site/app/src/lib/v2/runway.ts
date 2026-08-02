const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Rolling publication window: today plus the next six UTC dates. */
export const MIN_DOCKET_RUNWAY_DAYS = 7

/** Calendar date for an instant, pinned to UTC so CI runner locale cannot change it. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateOrdinal(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`) / MS_PER_DAY
}

function addDays(dateKey: string, days: number): string {
  return new Date((dateOrdinal(dateKey) + days) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}

/**
 * Returns a CI-ready error when the latest publish date is too close to today.
 * Date-only UTC arithmetic avoids daylight-saving and host-timezone drift.
 */
export function docketRunwayError(
  publishDates: readonly string[],
  now: Date = new Date(),
  minimumDays: number = MIN_DOCKET_RUNWAY_DAYS,
): string | null {
  const today = utcDateKey(now)
  const requiredThrough = addDays(today, Math.max(0, minimumDays - 1))
  const latestPublishDate = publishDates.reduce<string | null>(
    (latest, date) => (latest === null || date > latest ? date : latest),
    null,
  )

  if (latestPublishDate !== null && latestPublishDate >= requiredThrough) {
    return null
  }

  const latest = latestPublishDate ?? 'none'
  return (
    `docket runway expired: latest publish_date is ${latest}; ` +
    `requires ${minimumDays} covered dates through ${requiredThrough} ` +
    `(today ${today}, UTC)`
  )
}

/**
 * How many days in the window must actually open a new case.
 *
 * The runway check above measures the *horizon* — how far out the last case
 * sits. A docket can satisfy it and still not be daily: seven cases spread
 * across three weeks put the newest one beyond the rolling week while most days
 * open nothing new. On 2026-08-02 that was the live state, and the horizon gate
 * passed with a new case on only one of the next seven dates.
 *
 * This is a ratchet, not the target. It is set to what the docket genuinely
 * sustains today so it fails on regression rather than blocking every PR, and
 * it rises toward MIN_DOCKET_RUNWAY_DAYS as cases land. Raising it is the point;
 * ROADMAP.md carries the schedule.
 */
/** Bootstrap floor; raise atomically to 7 once the first complete week lands. */
export const MIN_DOCKET_COVERAGE_DAYS = 1

export interface DocketCoverage {
  /** Days examined, starting today. */
  window: number
  /** Days inside the window that open a new case. */
  covered: number
  /** Days inside the window that open nothing, in order. */
  uncovered: string[]
  /** Longest run of consecutive days showing the same case. */
  longestRepeat: number
}

/**
 * Count the days ahead that actually open a new case.
 *
 * A player returning tomorrow either finds a new trial or is re-served the one
 * they already sat through, so this counts publish dates rather than whether
 * the page renders something. `longestRepeat` is the number that describes the
 * experience: how many days in a row the docket shows the same case.
 */
export function docketCoverage(
  publishDates: readonly string[],
  now: Date = new Date(),
  windowDays: number = MIN_DOCKET_RUNWAY_DAYS,
): DocketCoverage {
  const today = utcDateKey(now)
  const published = new Set(publishDates)
  const uncovered: string[] = []
  let longestRepeat = 0
  let run = 0

  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = addDays(today, offset)
    if (published.has(day)) {
      run = 1
    } else {
      uncovered.push(day)
      run += 1
    }
    longestRepeat = Math.max(longestRepeat, run)
  }

  return {
    window: windowDays,
    covered: windowDays - uncovered.length,
    uncovered,
    longestRepeat,
  }
}

/**
 * Returns a CI-ready error when coverage has slipped below the ratchet.
 *
 * Deliberately not an error for merely being short of a daily docket — that is
 * a content backlog, not a broken build, and failing every PR over it would
 * only teach people to bypass the gate. It fails when coverage gets *worse*.
 */
export function docketCoverageError(
  publishDates: readonly string[],
  now: Date = new Date(),
  floor: number = MIN_DOCKET_COVERAGE_DAYS,
  windowDays: number = MIN_DOCKET_RUNWAY_DAYS,
): string | null {
  const coverage = docketCoverage(publishDates, now, windowDays)
  if (coverage.covered >= floor) return null
  return (
    `docket coverage fell to ${coverage.covered} of the next ${coverage.window} days ` +
    `(floor ${floor}); days opening no new case: ${coverage.uncovered.join(', ')}`
  )
}

/** One line for CI, so the gap between "daily" and the docket stays visible. */
export function formatDocketCoverage(coverage: DocketCoverage): string {
  const daily = coverage.covered === coverage.window
  const detail = daily
    ? 'a new case every day'
    : `${coverage.longestRepeat} day(s) in a row on the same case at worst`
  return `docket coverage: ${coverage.covered}/${coverage.window} days open a new case — ${detail}`
}
