import { dayIndex } from '../daily'
import { docketCaseSchema, type DocketCase } from './caseSchema'
import { loadV4CaseBundles } from './caseBundles'

/**
 * Runtime docket queue. Every JSON file in `docket/` is bundled at build time,
 * validated against the same schema the CI gate uses, and sorted into a stable
 * queue. Belt-and-suspenders: CI blocks a malformed case from merging, but if
 * one ever slips through we fail loudly at load rather than rendering a broken
 * trial to a player.
 *
 * The guided intro (`dd-intro`) lives in the same folder and must pass the same
 * schema, design-quality, and dynamics floors as every other docket case. It is
 * excluded only from the daily publish queue — offered on first visit and via
 * the case library, never as "today's" featured case.
 */
const modules = import.meta.glob('/docket/*.json', {
  eager: true,
  import: 'default',
})
const v4TrialModules = import.meta.glob('/docket/*/trial.json', {
  eager: true,
  import: 'default',
})
const v4AnalysisModules = import.meta.glob('/docket/*/analysis.json', {
  import: 'default',
})
const v4LegalSheetModules = import.meta.glob('/docket/*/legal-sheet.json', {
  import: 'default',
})
const v4DeliberationModules = import.meta.glob(
  '/docket/*/deliberation-pack.json',
  {
    import: 'default',
  },
)

/**
 * V4 is discovered through the active case module now, while the commissioned
 * V3 queue remains the selectable player surface during migration. The V5
 * jury/reveal consumer can add these validated bundles to DocketSitting
 * without changing the file boundary or loading editorial data early.
 */
export const v4CaseBundles = loadV4CaseBundles({
  trials: v4TrialModules,
  analyses: v4AnalysisModules,
  legalSheets: v4LegalSheetModules,
  deliberationPacks: v4DeliberationModules,
})

export const INTRO_CASE_ID = 'dd-intro'
/** Synthetic day index for the intro sitting (never a real calendar day). */
export const INTRO_SITTING_DAY = -1

function loadAllCases(): DocketCase[] {
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

const allCases = loadAllCases()

const duplicateV4Id = v4CaseBundles.find((bundle) =>
  allCases.some((trial) => trial.id === bundle.trial.id),
)
if (duplicateV4Id) {
  throw new Error(
    `Docket case ${duplicateV4Id.trial.id} exists in both V3 and V4`,
  )
}

export const introCase: DocketCase | null =
  allCases.find((c) => c.id === INTRO_CASE_ID) ?? null

export const docketQueue: DocketCase[] = allCases.filter(
  (c) => c.id !== INTRO_CASE_ID,
)

export interface DocketSitting {
  day: number
  date: Date
  trial: DocketCase
}

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

/**
 * Every commissioned daily case, one stable sitting per case.
 *
 * Library availability is deliberately independent from publication timing:
 * `docketCaseForDate` still controls the featured daily, while the library
 * lets a player choose any bundled case without duplicating gap-day fallbacks.
 */
export function docketLibrarySittings(
  queue: DocketCase[] = docketQueue,
): DocketSitting[] {
  return queue.map((trial) => {
    const date = localDateFromIso(trial.publish_date)
    return { day: dayIndex(date), date, trial }
  })
}

/** Exact library sitting only; an unknown day must not duplicate another case. */
export function selectDocketSitting(
  sittings: DocketSitting[],
  day: number,
): DocketSitting | null {
  return sittings.find((sitting) => sitting.day === day) ?? null
}

/** Date-gated featured sitting, retaining the actual day as its storage key. */
export function featuredDocketSitting(
  date: Date,
  queue: DocketCase[] = docketQueue,
): DocketSitting | null {
  const trial = docketCaseForDate(date, queue)
  return trial ? { day: dayIndex(date), date, trial } : null
}

export function introSitting(): DocketSitting | null {
  if (!introCase) return null
  return {
    day: INTRO_SITTING_DAY,
    date: localDateFromIso(introCase.publish_date),
    trial: introCase,
  }
}

export interface FeaturedFreshness {
  /** True when today opens no case of its own and an earlier one is re-served. */
  isRerun: boolean
  /** The date the featured case was actually published. */
  publishedOn: string
  /** Days between that publication and today. */
  daysOld: number
}

/**
 * Is today's featured case actually today's, or yesterday's served again?
 *
 * `docketCaseForDate` falls back to the newest earlier case whenever the queue
 * has a gap, which keeps the page working but says nothing about it. With the
 * docket opening a new case on three days in fourteen, most visits are a
 * re-serve, and a player who returned a verdict yesterday is shown the same
 * trial with nothing to distinguish it.
 *
 * Returns null when there is no case at all to describe.
 */
export function featuredFreshness(
  date: Date,
  queue: DocketCase[] = docketQueue,
): FeaturedFreshness | null {
  const trial = docketCaseForDate(date, queue)
  if (!trial) return null

  const today = localDateString(date)
  const publishedOn = trial.publish_date
  const daysOld = Math.round(
    (localDateFromIso(today).getTime() - localDateFromIso(publishedOn).getTime())
    / (24 * 60 * 60 * 1000),
  )

  return { isRerun: publishedOn !== today, publishedOn, daysOld }
}
