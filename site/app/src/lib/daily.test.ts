import { describe, expect, it } from 'vitest'
import { caseIndexForDate, dayIndex } from './daily'

describe('dayIndex', () => {
  it('is zero on the epoch day', () => {
    expect(dayIndex(new Date('2026-01-01T00:00:00.000Z'))).toBe(0)
  })

  it('counts whole calendar days regardless of time of day', () => {
    expect(dayIndex(new Date('2026-01-02T23:59:00.000Z'))).toBe(1)
    expect(dayIndex(new Date('2026-01-11T00:01:00.000Z'))).toBe(10)
  })

  it('is negative before the epoch', () => {
    expect(dayIndex(new Date('2025-12-31T23:59:00.000Z'))).toBe(-1)
  })

  it('rolls over only when the UTC date changes', () => {
    expect(dayIndex(new Date('2026-01-02T23:59:59.999Z'))).toBe(1)
    expect(dayIndex(new Date('2026-01-03T00:00:00.000Z'))).toBe(2)
  })
})

describe('caseIndexForDate', () => {
  it('wraps around the queue length', () => {
    expect(caseIndexForDate(new Date('2026-01-01T00:00:00Z'), 40)).toBe(0) // day 0
    expect(caseIndexForDate(new Date('2026-01-06T00:00:00Z'), 40)).toBe(5) // day 5
    expect(caseIndexForDate(new Date('2026-02-10T00:00:00Z'), 40)).toBe(0) // day 40 -> 0
  })

  it('never returns a negative index for pre-epoch dates', () => {
    expect(
      caseIndexForDate(new Date('2025-12-31T00:00:00Z'), 40),
    ).toBeGreaterThanOrEqual(0)
  })

  it('is safe for an empty queue', () => {
    expect(caseIndexForDate(new Date(), 0)).toBe(0)
  })
})
