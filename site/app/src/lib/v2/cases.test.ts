import { describe, expect, it } from 'vitest'
import {
  availableDocketSittings,
  docketCaseForDate,
  docketQueue,
  selectDocketSitting,
  SITTING_HISTORY_LIMIT,
} from './cases'

describe('docket queue', () => {
  it('bundles and validates every docket case', () => {
    expect(docketQueue.length).toBeGreaterThan(0)
    expect(docketQueue.some((c) => c.id === 'dd-0000')).toBe(true)
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
    const future = new Date(2026, 0, 1)
    const onlyFuture = docketQueue.filter((c) => c.publish_date > '2026-01-01')
    expect(docketCaseForDate(future, onlyFuture)).toBeNull()

    const queueWithGap = docketQueue.filter(
      (c) => c.publish_date === '2026-07-03' || c.publish_date === '2026-07-05',
    )
    expect(docketCaseForDate(new Date(2026, 6, 4), queueWithGap)?.id).toBe(
      'dd-0002',
    )
  })

  it('uses the newest earlier case for gaps and after the queue ends', () => {
    const queueWithGap = docketQueue.filter(
      (c) => c.publish_date !== '2026-07-04',
    )

    expect(docketCaseForDate(new Date(2026, 6, 4), queueWithGap)?.id).toBe(
      'dd-0002',
    )
    expect(docketCaseForDate(new Date(2026, 6, 31), docketQueue)?.id).toBe(
      'dd-0014',
    )
  })

  it('keeps a past sitting stable when later cases are added', () => {
    const playDate = new Date(2026, 6, 3)
    const queueAsOfDate = docketQueue.filter(
      (c) => c.publish_date <= '2026-07-03',
    )

    expect(docketCaseForDate(playDate, queueAsOfDate)?.id).toBe('dd-0002')
    expect(docketCaseForDate(playDate, docketQueue)?.id).toBe('dd-0002')
  })

  it('lists each published sitting through the selected local date', () => {
    const sittings = availableDocketSittings(new Date(2026, 6, 3), docketQueue)

    expect(sittings.map(({ date }) => date.getDate())).toEqual([1, 2, 3])
    expect(sittings.every(({ trial, date }) => trial.publish_date <=
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    )).toBe(true)
  })

  it('returns no sittings before the first publication or for an empty queue', () => {
    expect(availableDocketSittings(new Date(2026, 5, 30), docketQueue)).toEqual([])
    expect(availableDocketSittings(new Date(2026, 6, 3), [])).toEqual([])
  })

  it('caps history and falls back to its newest sitting', () => {
    const sittings = availableDocketSittings(new Date(2027, 0, 31), docketQueue)

    expect(sittings).toHaveLength(SITTING_HISTORY_LIMIT)
    expect(selectDocketSitting(sittings, -1)).toBe(sittings[sittings.length - 1])
    expect(selectDocketSitting([], -1)).toBeNull()
  })
})
