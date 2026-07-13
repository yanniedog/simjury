import { describe, expect, it } from 'vitest'
import { caseIndexForDate, dayIndex } from './daily'

describe('dayIndex', () => {
  it('is zero on the epoch day', () => {
    expect(dayIndex(new Date(2026, 0, 1))).toBe(0)
  })

  it('counts whole calendar days regardless of time of day', () => {
    expect(dayIndex(new Date(2026, 0, 2, 23, 59))).toBe(1)
    expect(dayIndex(new Date(2026, 0, 11, 0, 1))).toBe(10)
  })

  it('is negative before the epoch', () => {
    expect(dayIndex(new Date(2025, 11, 31))).toBe(-1)
  })
})

describe('caseIndexForDate', () => {
  it('wraps around the queue length', () => {
    expect(caseIndexForDate(new Date(2026, 0, 1), 40)).toBe(0) // day 0
    expect(caseIndexForDate(new Date(2026, 0, 6), 40)).toBe(5) // day 5
    expect(caseIndexForDate(new Date(2026, 1, 10), 40)).toBe(0) // day 40 -> 0
  })

  it('never returns a negative index for pre-epoch dates', () => {
    expect(caseIndexForDate(new Date(2025, 11, 31), 40)).toBeGreaterThanOrEqual(0)
  })

  it('is safe for an empty queue', () => {
    expect(caseIndexForDate(new Date(), 0)).toBe(0)
  })
})
