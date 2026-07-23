const MS_PER_DAY = 24 * 60 * 60 * 1000

export const MIN_DOCKET_RUNWAY_DAYS = 14

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
  const requiredThrough = addDays(today, minimumDays)
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
    `requires at least ${minimumDays} days through ${requiredThrough} ` +
    `(today ${today}, UTC)`
  )
}
