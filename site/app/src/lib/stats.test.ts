import { describe, expect, it } from 'vitest'
import { computeStats, type DayResult } from './stats'

const r = (day: number): DayResult => ({ day })

describe('computeStats', () => {
  it('is all zero for no plays', () => {
    expect(computeStats([])).toEqual({
      played: 0,
      currentStreak: 0,
      maxStreak: 0,
    })
  })

  it('counts completed docket days without grading the verdict', () => {
    const s = computeStats([r(1), r(2), r(3), r(4)])
    expect(s.played).toBe(4)
  })

  it('builds a streak over consecutive completed days', () => {
    const s = computeStats([r(1), r(2), r(3)])
    expect(s.currentStreak).toBe(3)
    expect(s.maxStreak).toBe(3)
  })

  it('breaks a streak on a missed (non-consecutive) day', () => {
    const s = computeStats([r(1), r(3)])
    expect(s.currentStreak).toBe(1)
    expect(s.maxStreak).toBe(1)
  })

  it('tracks the max run separate from the current run', () => {
    const s = computeStats([r(1), r(2), r(3), r(5), r(6)])
    expect(s.maxStreak).toBe(3)
    expect(s.currentStreak).toBe(2)
  })

  it('ignores input order', () => {
    const s = computeStats([r(3), r(1), r(2)])
    expect(s.currentStreak).toBe(3)
  })

  it('counts a docket day once if storage contains a duplicate', () => {
    expect(computeStats([r(1), r(1), r(2)]).played).toBe(2)
  })
})
