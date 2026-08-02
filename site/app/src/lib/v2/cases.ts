import { dayIndex } from '../daily'
import {
  docketCaseSchema,
  type DocketCase,
  type DocketCaseV4,
} from './caseSchema'
import {
  loadV4CaseBundles,
  type V4CaseBundle,
} from './caseBundles'

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
 * V4 trials join the selectable catalogue, while their deliberation and
 * answer-key files remain lazy chunks behind the bundle methods below.
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

export type DocketTrial = DocketCase | DocketCaseV4

export const docketQueue: DocketTrial[] = [
  ...allCases.filter((c) => c.id !== INTRO_CASE_ID),
  ...v4CaseBundles.map(({ trial }) => trial),
].sort((a, b) =>
  a.publish_date === b.publish_date
    ? a.id.localeCompare(b.id)
    : a.publish_date.localeCompare(b.publish_date),
)

interface DocketSittingBase {
  day: number
  date: Date
}

export interface DocketSittingV3 extends DocketSittingBase {
  schemaVersion: 3
  trial: DocketCase
}

export interface DocketSittingV4 extends DocketSittingBase, V4CaseBundle {}

export type DocketSitting = DocketSittingV3 | DocketSittingV4

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The case published for [date], falling back to the newest earlier case when
 * the queue has a gap or has ended. Publication dates are canonical: adding a
 * later case can never remap a past sitting.
 */
export function docketCaseForDate(
  date: Date,
  queue: DocketTrial[] = docketQueue,
): DocketTrial | null {
  const today = utcDateString(date)
  return queue.reduce<DocketTrial | null>((latest, trial) => {
    if (trial.publish_date > today) return latest
    if (latest === null || trial.publish_date > latest.publish_date) return trial
    return latest
  }, null)
}

function utcDateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

/**
 * Every commissioned daily case, one stable sitting per case.
 *
 * Library availability is deliberately independent from publication timing:
 * `docketCaseForDate` still controls the featured daily, while the library
 * lets a player choose any bundled case without duplicating gap-day fallbacks.
 */
export function docketLibrarySittings(
  queue: DocketTrial[] = docketQueue,
  bundles: V4CaseBundle[] = v4CaseBundles,
): DocketSitting[] {
  return queue.map((trial) => {
    const date = utcDateFromIso(trial.publish_date)
    return sittingForTrial(trial, date, dayIndex(date), bundles)
  })
}

function sittingForTrial(
  trial: DocketTrial,
  date: Date,
  day: number,
  bundles: V4CaseBundle[],
): DocketSitting {
  const bundle = bundles.find((candidate) => candidate.trial.id === trial.id)
  if (bundle) return { day, date, ...bundle }
  if (!('reference_verdict' in trial)) {
    throw new Error(`V4 case ${trial.id} has no revision-bound runtime bundle`)
  }
  return { day, date, schemaVersion: 3, trial }
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
  queue: DocketTrial[] = docketQueue,
  bundles: V4CaseBundle[] = v4CaseBundles,
): DocketSitting | null {
  const trial = docketCaseForDate(date, queue)
  return trial
    ? sittingForTrial(trial, date, dayIndex(date), bundles)
    : null
}

export function introSitting(): DocketSitting | null {
  if (!introCase) return null
  return {
    day: INTRO_SITTING_DAY,
    date: utcDateFromIso(introCase.publish_date),
    schemaVersion: 3,
    trial: introCase,
  }
}
