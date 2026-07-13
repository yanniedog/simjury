import { describe, expect, it } from 'vitest'
import { computeStats, type DayResult } from './stats'

const r = (day: number, correct: boolean): DayResult => ({ day, correct })

describe('computeStats', () => {
  it('is all zero for no plays', () => {
    expect(computeStats([])).toEqual({
      played: 0,
      wins: 0,
      winRate: 0,
      currentStreak: 0,
      maxStreak: 0,
    })
  })

  it('counts plays, wins and win rate', () => {
    const s = computeStats([r(1, true), r(2, false), r(3, true), r(4, true)])
    expect(s.played).toBe(4)
    expect(s.wins).toBe(3)
    expect(s.winRate).toBeCloseTo(0.75)
  })

  it('builds a streak over consecutive correct days', () => {
    const s = computeStats([r(1, true), r(2, true), r(3, true)])
    expect(s.currentStreak).toBe(3)
    expect(s.maxStreak).toBe(3)
  })

  it('breaks the current streak on the latest loss but keeps max', () => {
    const s = computeStats([r(1, true), r(2, true), r(3, false)])
    expect(s.currentStreak).toBe(0)
    expect(s.maxStreak).toBe(2)
  })

  it('breaks a streak on a missed (non-consecutive) day', () => {
    const s = computeStats([r(1, true), r(3, true)])
    expect(s.currentStreak).toBe(1)
    expect(s.maxStreak).toBe(1)
  })

  it('tracks the max run separate from the current run', () => {
    // 3-run, gap+loss, then a 2-run at the end.
    const s = computeStats([
      r(1, true),
      r(2, true),
      r(3, true),
      r(4, false),
      r(5, true),
      r(6, true),
    ])
    expect(s.maxStreak).toBe(3)
    expect(s.currentStreak).toBe(2)
  })

  it('ignores input order', () => {
    const s = computeStats([r(3, true), r(1, true), r(2, true)])
    expect(s.currentStreak).toBe(3)
  })
})
