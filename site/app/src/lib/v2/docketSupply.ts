/**
 * What the docket needs to stay daily for the next fortnight.
 *
 * `runway.ts` answers whether the docket is thin. This answers what to do about
 * it: exactly which dates open no case, so a commission names days rather than
 * a quantity.
 */
import { MIN_DOCKET_RUNWAY_DAYS, utcDateKey } from './runway'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface SupplyPlan {
  /** Today, UTC, so a runner's locale cannot shift the window. */
  today: string
  /** Days the plan covers. */
  window: number
  /** Dates inside the window that already open a case. */
  filled: string[]
  /** Dates inside the window that open nothing, in order — what to commission. */
  needed: string[]
}

function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
}

/**
 * Which dates need a case.
 *
 * Deliberately names empty dates rather than returning a total. "Commission
 * three more cases" says nothing about when they publish, and three filed on
 * the same day leave the docket exactly as thin as before.
 */
export function planSupply(
  publishDates: readonly string[],
  now: Date = new Date(),
  windowDays: number = MIN_DOCKET_RUNWAY_DAYS,
): SupplyPlan {
  const today = utcDateKey(now)
  const published = new Set(publishDates)
  const filled: string[] = []
  const needed: string[] = []

  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = addDays(today, offset)
    ;(published.has(day) ? filled : needed).push(day)
  }

  return { today, window: windowDays, filled, needed }
}

export function formatPlan(plan: SupplyPlan): string {
  if (plan.needed.length === 0) {
    return `docket supply: all ${plan.window} days from ${plan.today} open a case — nothing to commission`
  }
  return (
    `docket supply: ${plan.needed.length} of the next ${plan.window} days open no case.
`
    + `Commission one case for each of: ${plan.needed.join(', ')}`
  )
}
