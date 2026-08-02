/**
 * Deterministic daily-case selection.
 *
 * The case shown on a given day is a pure function of the UTC calendar date,
 * so every player worldwide sees the same case at the same time with no server.
 */

/** UTC midnight of the first daily. Advancing this shifts day 1. */
export const DAILY_EPOCH = new Date(Date.UTC(2026, 0, 1))

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Whole calendar days from [epoch] to [date], counted at UTC midnight so the
 * result is independent of the time of day.
 */
export function dayIndex(date: Date, epoch: Date = DAILY_EPOCH): number {
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const e = Date.UTC(
    epoch.getUTCFullYear(),
    epoch.getUTCMonth(),
    epoch.getUTCDate(),
  )
  return Math.floor((d - e) / MS_PER_DAY)
}

/**
 * Index into a queue of [queueLength] cases for the given date, wrapping around
 * when the queue is exhausted. Returns 0 for an empty queue so callers never
 * divide by zero, and never returns a negative index for pre-epoch dates.
 */
export function caseIndexForDate(
  date: Date,
  queueLength: number,
  epoch: Date = DAILY_EPOCH,
): number {
  if (queueLength <= 0) return 0
  const i = dayIndex(date, epoch) % queueLength
  return i < 0 ? i + queueLength : i
}
