import { describe, expect, it } from 'vitest'
import { caseForDate, caseQueue } from './cases'
import { caseSchema, type TrialCase } from './caseSchema'

function fixture(id: string, publish_date: string): TrialCase {
  return {
    id,
    publish_date,
    label: 'fiction',
    title: id,
    era: 'e',
    charge: 'c',
    elements: ['one', 'two'],
    beats: Array.from({ length: 4 }, (_, i) => ({
      id: `b${i}`,
      kind: 'witness' as const,
      text: 't',
      surface_persuasion: 0.5,
      true_weight: 0.5,
      direction: 'guilt' as const,
      reveal_stamp: 'minor' as const,
      reveal_note: 'n',
    })),
    verdict_truth: 'Guilty',
    twist: 'x',
    difficulty_target: 0.5,
    gen_meta: { model: 'm', prompt_version: 'p', reviewer: 'r', batch_pr: 'b' },
  }
}

describe('caseForDate', () => {
  const queue = [fixture('d-0001', '2026-01-01'), fixture('d-0002', '2026-01-02')]

  it('returns null for an empty queue', () => {
    expect(caseForDate(new Date(2026, 0, 1), [])).toBeNull()
  })

  it('picks by local calendar day and wraps the queue', () => {
    expect(caseForDate(new Date(2026, 0, 1), queue)?.id).toBe('d-0001')
    expect(caseForDate(new Date(2026, 0, 2), queue)?.id).toBe('d-0002')
    expect(caseForDate(new Date(2026, 0, 3), queue)?.id).toBe('d-0001')
  })
})

describe('bundled case queue', () => {
  it('loads at least one case and every case is schema-valid', () => {
    expect(caseQueue.length).toBeGreaterThan(0)
    for (const c of caseQueue) {
      expect(caseSchema.safeParse(c).success).toBe(true)
    }
  })
})
