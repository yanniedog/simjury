import { describe, expect, it } from 'vitest'
import {
  availableDocketSittings,
  docketCaseForDate,
  docketQueue,
  INTRO_CASE_ID,
  introCase,
  selectDocketSitting,
  SITTING_HISTORY_LIMIT,
} from './cases'

describe('docket queue', () => {
  it('bundles featured cases and keeps the intro separate', () => {
    expect(docketQueue.length).toBeGreaterThan(0)
    expect(docketQueue.every((c) => c.id !== INTRO_CASE_ID)).toBe(true)
    expect(introCase?.id).toBe(INTRO_CASE_ID)
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

  it('lists each published sitting through the selected local date', () => {
    const first = docketQueue[0]
    const [year, month, day] = first.publish_date.split('-').map(Number)
    const thirdDay = new Date(year, month - 1, day + 2)
    const sittings = availableDocketSittings(thirdDay, docketQueue)

    expect(sittings.length).toBe(3)
    expect(sittings.every(({ trial, date }) => trial.publish_date <=
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    )).toBe(true)
  })

  it('returns no sittings before the first publication or for an empty queue', () => {
    expect(availableDocketSittings(new Date(2026, 6, 23), docketQueue)).toEqual([])
    expect(availableDocketSittings(new Date(2026, 6, 24), [])).toEqual([])
  })

  it('caps history and falls back to its newest sitting', () => {
    const sittings = availableDocketSittings(new Date(2027, 0, 31), docketQueue)
    expect(sittings.length).toBeLessThanOrEqual(SITTING_HISTORY_LIMIT)
    expect(selectDocketSitting(sittings, 99999)?.trial).toBe(
      sittings[sittings.length - 1]?.trial,
    )
  })
})
