import { caseIndexForDate } from '../daily'
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

function localDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The docket case to play on [date], or null while the queue is empty. */
export function docketCaseForDate(
  date: Date,
  queue: DocketCase[] = docketQueue,
): DocketCase | null {
  const today = localDateString(date)
  const eligible = queue.filter((c) => c.publish_date <= today)
  if (eligible.length === 0) return null
  return eligible[caseIndexForDate(date, eligible.length)] ?? null
}
