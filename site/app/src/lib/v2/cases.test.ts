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
    expect(commissioned.every((c) => c?.gen_meta.prompt_version === 'dd-2026-v3')).toBe(true)
  })

  it('serves each launch case on its canonical publish date', () => {
    for (const trial of docketQueue) {
      const [year, month, day] = trial.publish_date.split('-').map(Number)
      expect(docketCaseForDate(new Date(year, month - 1, day))).toBe(trial)
    }
  })

  it('returns null for an empty queue', () => {
    const date = new Date(2026, 7, 15)
    expect(docketCaseForDate(date, [])).toBeNull()
  })

  it('never leaks a future case', () => {
    const beforeFirst = new Date(2026, 6, 23)
    expect(docketCaseForDate(beforeFirst, docketQueue)).toBeNull()
  })

  it('uses the newest earlier case for gaps and after the queue ends', () => {
    const newest = docketQueue[docketQueue.length - 1]
    const [year, month, day] = newest.publish_date.split('-').map(Number)
    const afterQueueEnd = new Date(year, month - 1, day + 1)
    expect(docketCaseForDate(afterQueueEnd, docketQueue)).toBe(newest)

    const first = docketQueue[0]
    const second = docketQueue[1]
    const gapQueue = [first, second]
    const [fy, fm, fd] = first.publish_date.split('-').map(Number)
    const gapDate = new Date(fy, fm - 1, fd + 1)
    // With contiguous dates, the day after first is second's publish day when present.
    expect(docketCaseForDate(gapDate, gapQueue)?.id).toBe(
      second.publish_date ===
        `${gapDate.getFullYear()}-${String(gapDate.getMonth() + 1).padStart(2, '0')}-${String(gapDate.getDate()).padStart(2, '0')}`
        ? second.id
        : first.id,
    )
  })

  it('keeps a past sitting stable when later cases are added', () => {
    const first = docketQueue[0]
    const [year, month, day] = first.publish_date.split('-').map(Number)
    const playDate = new Date(year, month - 1, day)
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
    const gapDate = new Date(2026, 6, 29)
    const featured = featuredDocketSitting(gapDate, docketQueue)

    expect(featured?.trial).toBe(docketCaseForDate(gapDate, docketQueue))
    expect(featured?.trial.id).toBe('dd-0006')
    expect(featured?.day).toBe(dayIndex(gapDate))
    expect(featured?.date).toBe(gapDate)
    expect(featuredDocketSitting(new Date(2026, 6, 23), docketQueue)).toBeNull()
  })
})
