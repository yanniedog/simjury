import { caseIndexForDate } from './daily'
import { caseSchema, type TrialCase } from './caseSchema'

/**
 * Runtime case queue.
 *
 * Every JSON file in `cases/` is bundled at build time, validated against the
 * same schema the CI `validate:cases` gate uses, and sorted into a stable queue.
 * Validation here is belt-and-suspenders: the CI gate already blocks a malformed
 * case from merging, but if one ever slips through we fail loudly at load rather
 * than rendering a broken trial to a player.
 */
const modules = import.meta.glob('/cases/*.json', {
  eager: true,
  import: 'default',
})

function loadQueue(): TrialCase[] {
  const cases: TrialCase[] = []
  for (const [path, raw] of Object.entries(modules)) {
    const parsed = caseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid case ${path}: ${parsed.error.message}`)
    }
    cases.push(parsed.data)
  }
  // Stable order so the daily selector is deterministic regardless of glob order.
  return cases.sort((a, b) =>
    a.publish_date === b.publish_date
      ? a.id.localeCompare(b.id)
      : a.publish_date.localeCompare(b.publish_date),
  )
}

export const caseQueue: TrialCase[] = loadQueue()

/**
 * The case to play on [date], or null if the queue is empty. Selection wraps the
 * queue by local calendar day (see {@link caseIndexForDate}), so every player
 * sees the same case on the same day with no server.
 */
export function caseForDate(
  date: Date,
  queue: TrialCase[] = caseQueue,
): TrialCase | null {
  if (queue.length === 0) return null
  return queue[caseIndexForDate(date, queue.length)]
}
