import { describe, expect, it } from 'vitest'
import {
  docketCoverage,
  docketCoverageError,
  docketRunwayError,
  formatDocketCoverage,
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

  it('rejects an empty docket', () => {
    expect(docketRunwayError([], today)).toBe(
      'docket runway expired: latest publish_date is none; ' +
        'requires at least 14 days through 2026-08-06 (today 2026-07-23, UTC)',
    )
  })

  it('uses the UTC calendar date regardless of the input offset', () => {
    const sameInstant = new Date('2026-07-23T00:30:00+10:00')

    expect(utcDateKey(sameInstant)).toBe('2026-07-22')
    expect(docketRunwayError(['2026-08-05'], sameInstant)).toBeNull()
  })
})

describe('docket coverage', () => {
  // The live docket on 2026-08-02: seven cases spread across three weeks.
  const LIVE = [
    '2026-07-27', '2026-07-28', '2026-08-01',
    '2026-08-05', '2026-08-09', '2026-08-13', '2026-08-18',
  ]
  const on = (day: string) => new Date(`${day}T00:00:00Z`)

  it('counts the days that open a new case, not the days that render one', () => {
    // The horizon gate passes on this exact input, because the newest case sits
    // sixteen days out. A player still meets a new trial on three days in
    // fourteen — that difference is the whole reason this exists.
    expect(docketRunwayError(LIVE, on('2026-08-02'))).toBeNull()

    const coverage = docketCoverage(LIVE, on('2026-08-02'))
    expect(coverage.covered).toBe(3)
    expect(coverage.window).toBe(14)
    expect(coverage.uncovered).toHaveLength(11)
  })

  it('reports how long a returning player is served the same case', () => {
    // Between cases: 2026-08-13 publishes, then nothing until the 18th, so
    // someone arriving on the 13th sees that trial for five days running.
    const betweenCases = docketCoverage(LIVE, on('2026-08-13'), 6)
    expect(betweenCases.longestRepeat).toBe(5)

    // Past the last case the run just keeps going, which is the more important
    // number: after 2026-08-18 the docket has nothing further to show at all.
    const pastTheEnd = docketCoverage(LIVE, on('2026-08-13'))
    expect(pastTheEnd.longestRepeat).toBe(9)
    expect(formatDocketCoverage(pastTheEnd)).toContain('9 day(s) in a row')
  })

  it('calls a genuinely daily docket daily', () => {
    const daily = Array.from({ length: 20 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 7, 2) + i * 86_400_000)
      return day.toISOString().slice(0, 10)
    })
    const coverage = docketCoverage(daily, on('2026-08-02'))
    expect(coverage.covered).toBe(14)
    expect(coverage.uncovered).toEqual([])
    expect(coverage.longestRepeat).toBe(1)
    expect(formatDocketCoverage(coverage)).toContain('a new case every day')
  })

  it('fails only when coverage gets worse, so a backlog does not block every PR', () => {
    // Three covered days clears the current floor of three.
    expect(docketCoverageError(LIVE, on('2026-08-02'))).toBeNull()

    // Losing one is a regression and must be caught.
    const dropped = LIVE.filter((date) => date !== '2026-08-05')
    const error = docketCoverageError(dropped, on('2026-08-02'))
    expect(error).toContain('fell to 2 of the next 14 days')
    expect(error).toContain('2026-08-05')
  })

  it('treats an empty docket as no coverage at all', () => {
    const coverage = docketCoverage([], on('2026-08-02'))
    expect(coverage.covered).toBe(0)
    expect(coverage.longestRepeat).toBe(14)
    expect(docketCoverageError([], on('2026-08-02'))).toContain('fell to 0')
  })

  it('ignores cases already behind us', () => {
    const coverage = docketCoverage(['2026-07-01', '2026-08-02'], on('2026-08-02'))
    expect(coverage.covered).toBe(1)
  })
})
