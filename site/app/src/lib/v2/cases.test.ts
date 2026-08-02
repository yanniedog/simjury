import { describe, expect, it } from 'vitest'
import {
  docketLibrarySittings,
  docketCaseForDate,
  docketQueue,
  featuredDocketSitting,
  INTRO_CASE_ID,
  introCase,
  selectDocketSitting,
} from './cases'
import { dayIndex } from '../daily'

describe('docket queue', () => {
  it('bundles featured cases and keeps the intro separate', () => {
    expect(docketQueue.map((trial) => trial.id)).toEqual([
      'dd-0006',
      'dd-0017',
      'dd-0032',
      'dd-0038',
      'dd-0037',
      'dd-0039',
    ])
    expect(docketQueue.every((c) => c.id !== INTRO_CASE_ID)).toBe(true)
    expect(introCase?.id).toBe(INTRO_CASE_ID)
    const commissioned = [introCase, ...docketQueue]
    expect(commissioned).toHaveLength(7)
    expect(new Set(commissioned.map((trial) => trial?.id))).toHaveLength(7)
    expect(commissioned.every((c) =>
      ['dd-2026-v3', 'dd-2026-v3-20min'].includes(
        c?.gen_meta.prompt_version ?? '',
      ),
    )).toBe(true)
  })

  it('serves each launch case on its canonical publish date', () => {
    for (const trial of docketQueue) {
      expect(
        docketCaseForDate(new Date(`${trial.publish_date}T00:00:00.000Z`)),
      ).toBe(trial)
    }
  })

  it('switches the featured case at one shared UTC boundary', () => {
    const later = docketQueue[1]
    const prior = docketQueue[0]

    expect(
      docketCaseForDate(
        new Date(`${later.publish_date}T00:00:00.000Z`),
        [prior, later],
      ),
    ).toBe(later)
    expect(
      docketCaseForDate(
        new Date(
          new Date(`${later.publish_date}T00:00:00.000Z`).valueOf() - 1,
        ),
        [prior, later],
      ),
    ).toBe(prior)
  })

  it('returns null for an empty queue', () => {
    const date = new Date('2026-08-15T00:00:00Z')
    expect(docketCaseForDate(date, [])).toBeNull()
  })

  it('never leaks a future case', () => {
    const beforeFirst = new Date('2026-07-23T00:00:00Z')
    expect(docketCaseForDate(beforeFirst, docketQueue)).toBeNull()
  })

  it('uses the newest earlier case for gaps and after the queue ends', () => {
    const newest = docketQueue[docketQueue.length - 1]
    const afterQueueEnd = new Date(
      new Date(`${newest.publish_date}T00:00:00Z`).valueOf() + 86_400_000,
    )
    expect(docketCaseForDate(afterQueueEnd, docketQueue)).toBe(newest)

    const first = docketQueue[0]
    const second = docketQueue[1]
    const gapQueue = [first, second]
    const gapDate = new Date(
      new Date(`${first.publish_date}T00:00:00Z`).valueOf() + 86_400_000,
    )
    // With contiguous dates, the day after first is second's publish day when present.
    expect(docketCaseForDate(gapDate, gapQueue)?.id).toBe(
      second.publish_date ===
        gapDate.toISOString().slice(0, 10)
        ? second.id
        : first.id,
    )
  })

  it('keeps a past sitting stable when later cases are added', () => {
    const first = docketQueue[0]
    const playDate = new Date(`${first.publish_date}T00:00:00Z`)
    const queueAsOfDate = docketQueue.filter(
      (c) => c.publish_date <= first.publish_date,
    )

    expect(docketCaseForDate(playDate, queueAsOfDate)?.id).toBe(first.id)
    expect(docketCaseForDate(playDate, docketQueue)?.id).toBe(first.id)
  })

  it('lists every commissioned daily case once, including future features', () => {
    const sittings = docketLibrarySittings(docketQueue)

    expect(sittings.map(({ trial }) => trial.id)).toEqual(
      docketQueue.map(({ id }) => id),
    )
    expect(new Set(sittings.map(({ trial }) => trial.id))).toHaveLength(6)
    expect(new Set(sittings.map(({ day }) => day))).toHaveLength(6)
    for (const sitting of sittings) {
      expect(sitting.day).toBe(dayIndex(sitting.date))
      expect(selectDocketSitting(sittings, sitting.day)).toBe(sitting)
    }
  })

  it('does not manufacture duplicate fallback sittings', () => {
    const sittings = docketLibrarySittings(docketQueue.slice(0, 2))

    expect(sittings.map(({ trial }) => trial.id)).toEqual(['dd-0006', 'dd-0017'])
    expect(selectDocketSitting(sittings, 99999)).toBeNull()
    expect(docketLibrarySittings([])).toEqual([])
  })

  it('keeps the featured default date-gated on a gap day', () => {
    const gapDate = new Date('2026-07-29T00:00:00Z')
    const featured = featuredDocketSitting(gapDate, docketQueue)

    expect(featured?.trial).toBe(docketCaseForDate(gapDate, docketQueue))
    expect(featured?.trial.id).toBe('dd-0006')
    expect(featured?.day).toBe(dayIndex(gapDate))
    expect(featured?.date).toBe(gapDate)
    expect(
      featuredDocketSitting(
        new Date('2026-07-23T00:00:00Z'),
        docketQueue,
      ),
    ).toBeNull()
  })
})
