import { describe, expect, it, vi } from 'vitest'
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
import type { DocketCaseV4 } from './caseSchema'
import type { V4CaseBundle } from './caseBundles'

function fakeV4(publishDate: string): DocketCaseV4 {
  const trial = structuredClone(docketQueue[0]) as unknown as Record<string, unknown>
  trial.id = 'dd-v4-runtime'
  trial.publish_date = publishDate
  delete trial.reference_verdict
  delete trial.twist
  delete trial.epilogue
  return trial as unknown as DocketCaseV4
}

describe('docket queue', () => {
  it('bundles featured cases and keeps the intro separate', () => {
    expect(docketQueue.map((trial) => trial.id)).toEqual([
      'dd-0006',
      'dd-0017',
      'dd-0038',
      'dd-0040',
      'dd-0037',
      'dd-0032',
      'dd-0041',
      'dd-0039',
      'dd-0042',
    ])
    expect(docketQueue.every((c) => c.id !== INTRO_CASE_ID)).toBe(true)
    expect(introCase?.id).toBe(INTRO_CASE_ID)
    const commissioned = [introCase, ...docketQueue]
    expect(commissioned).toHaveLength(10)
    expect(new Set(commissioned.map((trial) => trial?.id))).toHaveLength(10)
    expect(commissioned.every((c) =>
      ['dd-2026-v3', 'dd-2026-v3-20min'].includes(
        c?.gen_meta.prompt_version ?? '',
      ),
    )).toBe(true)
  })

  it('opens the commissioned bootstrap week on seven consecutive UTC dates', () => {
    const bootstrap = docketQueue.filter(
      ({ publish_date }) =>
        publish_date >= '2026-08-02' && publish_date <= '2026-08-08',
    )

    expect(bootstrap.map((trial) => ({
      id: trial.id,
      publish_date: trial.publish_date,
      reference_verdict:
        'reference_verdict' in trial ? trial.reference_verdict : 'V4',
    }))).toEqual([
      { id: 'dd-0038', publish_date: '2026-08-02', reference_verdict: 'Not Guilty' },
      { id: 'dd-0040', publish_date: '2026-08-03', reference_verdict: 'Guilty' },
      { id: 'dd-0037', publish_date: '2026-08-04', reference_verdict: 'Not Guilty' },
      { id: 'dd-0032', publish_date: '2026-08-05', reference_verdict: 'Guilty' },
      { id: 'dd-0041', publish_date: '2026-08-06', reference_verdict: 'Guilty' },
      { id: 'dd-0039', publish_date: '2026-08-07', reference_verdict: 'Not Guilty' },
      { id: 'dd-0042', publish_date: '2026-08-08', reference_verdict: 'Guilty' },
    ])

    const cancelledDrill = bootstrap.find(({ id }) => id === 'dd-0040')!
    const secondImpact = bootstrap.find(({ id }) => id === 'dd-0041')!
    const openDoor = bootstrap.find(({ id }) => id === 'dd-0042')!
    expect(cancelledDrill.beats.some(({ text }) =>
      text.includes('General speeches, lawful advocacy, associations, and opinions have been excluded'),
    )).toBe(true)
    expect(secondImpact.beats.some(({ text }) =>
      text.includes('two sharp metallic events'),
    )).toBe(true)
    expect(openDoor.beats.some(({ text }) =>
      text.includes('admitted only to help you assess Nela\'s state of mind'),
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

  it('selects V4 sittings without loading either lazy boundary', async () => {
    const prior = docketQueue[0]
    const trial = fakeV4('2026-07-29')
    const loadDeliberationPack = vi.fn(async () => ({} as never))
    const loadPostVerdict = vi.fn(async () => ({} as never))
    const bundle: V4CaseBundle = {
      schemaVersion: 4,
      trial,
      loadDeliberationPack,
      loadPostVerdict,
    }
    const queue = [prior, trial]

    const featured = featuredDocketSitting(
      new Date('2026-07-29T12:00:00.000Z'),
      queue,
      [bundle],
    )
    const library = docketLibrarySittings(queue, [bundle])

    expect(featured?.schemaVersion).toBe(4)
    expect(featured?.trial).toBe(trial)
    expect(library.map(({ trial: item }) => item.id)).toEqual([
      prior.id,
      trial.id,
    ])
    expect(loadDeliberationPack).not.toHaveBeenCalled()
    expect(loadPostVerdict).not.toHaveBeenCalled()

    if (featured?.schemaVersion !== 4) throw new Error('expected V4 sitting')
    await featured.loadDeliberationPack()
    expect(loadDeliberationPack).toHaveBeenCalledOnce()
    expect(loadPostVerdict).not.toHaveBeenCalled()

    // The route remains available for the reveal consumer, but only an
    // explicit post-verdict call crosses this second lazy boundary.
    await featured.loadPostVerdict()
    expect(loadPostVerdict).toHaveBeenCalledOnce()
  })

  it('retains V3 compatibility and does not remap its past UTC sitting', () => {
    const prior = docketQueue[0]
    const trial = fakeV4('2026-07-29')
    const bundle = {
      schemaVersion: 4,
      trial,
      loadDeliberationPack: vi.fn(async () => ({} as never)),
      loadPostVerdict: vi.fn(async () => ({} as never)),
    } satisfies V4CaseBundle

    const before = featuredDocketSitting(
      new Date(`${prior.publish_date}T23:59:59.999Z`),
      [prior],
      [],
    )
    const after = featuredDocketSitting(
      new Date(`${prior.publish_date}T23:59:59.999Z`),
      [prior, trial],
      [bundle],
    )

    expect(before?.schemaVersion).toBe(3)
    expect(after?.schemaVersion).toBe(3)
    expect(after?.trial.id).toBe(prior.id)
  })

  it('fails closed when a V4 trial loses its bundle', () => {
    const trial = fakeV4('2026-07-29')
    expect(() => docketLibrarySittings([trial], [])).toThrow(
      /has no revision-bound runtime bundle/,
    )
  })

  it('lists every commissioned daily case once, including future features', () => {
    const sittings = docketLibrarySittings(docketQueue)

    expect(sittings.map(({ trial }) => trial.id)).toEqual(
      docketQueue.map(({ id }) => id),
    )
    expect(new Set(sittings.map(({ trial }) => trial.id))).toHaveLength(9)
    expect(new Set(sittings.map(({ day }) => day))).toHaveLength(9)
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
