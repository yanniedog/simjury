import { describe, expect, it } from 'vitest'
import { docketCaseForDate, docketQueue } from './cases'

describe('docket queue', () => {
  it('bundles and validates every docket case', () => {
    expect(docketQueue.length).toBeGreaterThan(0)
    expect(docketQueue.some((c) => c.id === 'dd-0000')).toBe(true)
  })

  it('serves the same case for the same date and null for an empty queue', () => {
    const date = new Date(2026, 7, 15)
    expect(docketCaseForDate(date)).toBe(docketCaseForDate(date))
    expect(docketCaseForDate(date, [])).toBeNull()
  })
})
