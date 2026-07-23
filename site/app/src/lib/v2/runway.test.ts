import { describe, expect, it } from 'vitest'
import {
  docketRunwayError,
  MIN_DOCKET_RUNWAY_DAYS,
  utcDateKey,
} from './runway'

describe('docketRunwayError', () => {
  const today = new Date('2026-07-23T12:00:00Z')

  it('accepts the exact 14-day boundary', () => {
    expect(
      docketRunwayError(['2026-08-05', '2026-08-06'], today),
    ).toBeNull()
    expect(MIN_DOCKET_RUNWAY_DAYS).toBe(14)
  })

  it('rejects an expired runway with an actionable date', () => {
    expect(docketRunwayError(['2026-07-15', '2026-08-05'], today)).toBe(
      'docket runway expired: latest publish_date is 2026-08-05; ' +
        'requires at least 14 days through 2026-08-06 (today 2026-07-23, UTC)',
    )
  })

  it('uses the UTC calendar date regardless of the input offset', () => {
    const sameInstant = new Date('2026-07-23T00:30:00+10:00')

    expect(utcDateKey(sameInstant)).toBe('2026-07-22')
    expect(docketRunwayError(['2026-08-05'], sameInstant)).toBeNull()
  })
})
