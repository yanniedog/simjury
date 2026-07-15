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

  it('only serves cases whose publish_date is on or before the play date', () => {
    const future = new Date(2026, 0, 1)
    const onlyFuture = docketQueue.filter((c) => c.publish_date > '2026-01-01')
    expect(docketCaseForDate(future, onlyFuture)).toBeNull()
  })
})
