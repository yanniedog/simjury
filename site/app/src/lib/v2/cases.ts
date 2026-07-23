import { DAILY_EPOCH, dayIndex } from '../daily'
import { docketCaseSchema, type DocketCase } from './caseSchema'

/**
 * Runtime docket queue. Every JSON file in `docket/` is bundled at build time,
 * validated against the same schema the CI gate uses, and sorted into a stable
 * queue. Belt-and-suspenders: CI blocks a malformed case from merging, but if
 * one ever slips through we fail loudly at load rather than rendering a broken
 * trial to a player.
 */
const modules = import.meta.glob('/docket/*.json', {
  eager: true,
  import: 'default',
})

function loadQueue(): DocketCase[] {
  const cases: DocketCase[] = []
  for (const [path, raw] of Object.entries(modules)) {
    const parsed = docketCaseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid docket case ${path}: ${parsed.error.message}`)
    }
    cases.push(parsed.data)
  }
  return cases.sort((a, b) =>
    a.publish_date === b.publish_date
      ? a.id.localeCompare(b.id)
      : a.publish_date.localeCompare(b.publish_date),
  )
}

export const docketQueue: DocketCase[] = loadQueue()

export interface DocketSitting {
  day: number
  date: Date
  trial: DocketCase
}

/** Keep the native date picker useful without growing it forever. */
export const SITTING_HISTORY_LIMIT = 90

function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * The case published for [date], falling back to the newest earlier case when
 * the queue has a gap or has ended. Publication dates are canonical: adding a
 * later case can never remap a past sitting.
 */
export function docketCaseForDate(
  date: Date,
  queue: DocketCase[] = docketQueue,
): DocketCase | null {
  const today = localDateString(date)
  return queue.reduce<DocketCase | null>((latest, trial) => {
    if (trial.publish_date > today) return latest
    if (latest === null || trial.publish_date > latest.publish_date) return trial
    return latest
  }, null)
}

function localDateFromIso(value: string): Date {
  const [year, month, date] = value.split('-').map(Number)
  return new Date(year, month - 1, date)
}

function dateFromDayIndex(day: number): Date {
  return new Date(
    DAILY_EPOCH.getFullYear(),
    DAILY_EPOCH.getMonth(),
    DAILY_EPOCH.getDate() + day,
  )
}

/** The most recent published sittings through [date], oldest first. */
export function availableDocketSittings(
  date: Date,
  queue: DocketCase[] = docketQueue,
): DocketSitting[] {
  if (queue.length === 0) return []
  const firstPublished = queue.reduce(
    (first, trial) => trial.publish_date < first ? trial.publish_date : first,
    queue[0].publish_date,
  )
  const firstDay = dayIndex(localDateFromIso(firstPublished))
  const lastDay = dayIndex(date)
  const startDay = Math.max(firstDay, lastDay - SITTING_HISTORY_LIMIT + 1)
  const sittings: DocketSitting[] = []

  for (let day = startDay; day <= lastDay; day++) {
    const sittingDate = dateFromDayIndex(day)
    const trial = docketCaseForDate(sittingDate, queue)
    if (trial) sittings.push({ day, date: sittingDate, trial })
  }
  return sittings
}

/** Exact sitting when available, otherwise the newest published fallback. */
export function selectDocketSitting(
  sittings: DocketSitting[],
  day: number,
): DocketSitting | null {
  return sittings.find((sitting) => sitting.day === day) ??
    sittings[sittings.length - 1] ?? null
}
