import { describe, expect, it } from 'vitest'
import { formatPlan, planSupply } from './docketSupply'

describe('docket supply plan', () => {
  const on = (day: string) => new Date(`${day}T00:00:00Z`)
  // The live docket on 2026-08-02.
  const LIVE = ['2026-07-28', '2026-08-01', '2026-08-05', '2026-08-09', '2026-08-13', '2026-08-18']

  it('names the dates that need a case, not a count', () => {
    // "Commission three cases" says nothing about when they publish, and three
    // filed on one day leave the docket exactly as thin as before.
    const plan = planSupply(LIVE, on('2026-08-02'))
    expect(plan.needed).toHaveLength(11)
    expect(plan.needed[0]).toBe('2026-08-02')
    expect(plan.needed).not.toContain('2026-08-05')
    expect(plan.filled).toEqual(['2026-08-05', '2026-08-09', '2026-08-13'])
  })

  it('asks for nothing once the fortnight is covered', () => {
    const daily = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(2026, 7, 2) + i * 86_400_000).toISOString().slice(0, 10))
    const plan = planSupply(daily, on('2026-08-02'))
    expect(plan.needed).toEqual([])
    expect(formatPlan(plan)).toContain('nothing to commission')
  })

  it('counts today itself as needing a case when nothing opens', () => {
    expect(planSupply([], on('2026-08-02')).needed).toHaveLength(14)
  })

  it('ignores cases behind us and beyond the window', () => {
    const plan = planSupply(['2026-07-01', '2026-09-30'], on('2026-08-02'))
    expect(plan.filled).toEqual([])
    expect(plan.needed).toHaveLength(14)
  })

  it('pins the window to UTC so a runner locale cannot shift it', () => {
    const plan = planSupply(['2026-08-02'], new Date('2026-08-02T23:30:00Z'))
    expect(plan.today).toBe('2026-08-02')
    expect(plan.filled).toEqual(['2026-08-02'])
  })
})
