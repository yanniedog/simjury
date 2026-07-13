import { describe, expect, it } from 'vitest'
import { checkCase, checkQueue } from './caseQuality'
import type { TrialBeat, TrialCase } from './caseSchema'

function beat(overrides: Partial<TrialBeat>): TrialBeat {
  return {
    id: 'b',
    kind: 'witness',
    text: 't',
    surface_persuasion: 0.5,
    true_weight: 0.5,
    direction: 'guilt',
    reveal_stamp: 'minor',
    reveal_note: 'n',
    ...overrides,
  }
}

function make(overrides: Partial<TrialCase> = {}): TrialCase {
  return {
    id: 'd-0001',
    publish_date: '2026-01-01',
    label: 'fiction',
    title: 'A well-designed case',
    era: 'e',
    charge: 'c',
    elements: ['one', 'two'],
    // A trap (guilt, feels strong / worth little) + a decisive innocence signal
    // + both directions => solvable Not Guilty.
    beats: [
      beat({ id: 'b1', direction: 'guilt', reveal_stamp: 'misleading', surface_persuasion: 0.85, true_weight: 0.2 }),
      beat({ id: 'b2', direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.4, true_weight: 0.85 }),
      beat({ id: 'b3', direction: 'innocence', reveal_stamp: 'minor', surface_persuasion: 0.3, true_weight: 0.3 }),
      beat({ id: 'b4', direction: 'guilt', reveal_stamp: 'minor', surface_persuasion: 0.4, true_weight: 0.4 }),
    ],
    verdict_truth: 'Not Guilty',
    twist: 'x',
    difficulty_target: 0.5,
    gen_meta: { model: 'm', prompt_version: 'p', reviewer: 'r', batch_pr: 'b' },
    ...overrides,
  }
}

describe('checkCase', () => {
  it('passes a well-designed case', () => {
    expect(checkCase(make())).toEqual([])
  })

  it('flags a missing trap', () => {
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'misleading' ? { ...b, reveal_stamp: 'minor' } : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(/misleading beat/)
  })

  it('flags a trap that does not actually mislead', () => {
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'misleading'
          ? { ...b, surface_persuasion: 0.5, true_weight: 0.5 }
          : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(/more persuasive than it is worth/)
  })

  it('accepts a trap whose gap is exactly the threshold despite float error', () => {
    // 0.33 - 0.08 === 0.24999999999999997 in JS; the epsilon must not reject it.
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'misleading'
          ? { ...b, surface_persuasion: 0.33, true_weight: 0.08 }
          : b,
      ),
    })
    expect(checkCase(c).join()).not.toMatch(/more persuasive than it is worth/)
  })

  it('flags a minor beat that secretly carries decisive weight', () => {
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'minor' ? { ...b, true_weight: 0.8 } : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(/minor beat .* must not carry decisive weight/)
  })

  it('flags a weak decisive beat', () => {
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'decisive' ? { ...b, true_weight: 0.3 } : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(/carry real weight/)
  })

  it('flags a one-sided case', () => {
    const c = make({
      beats: make().beats.map((b) => ({ ...b, direction: 'innocence' })),
    })
    expect(checkCase(c).join()).toMatch(/both guilt and innocence/)
  })

  it('flags an unsolvable case (decisive evidence contradicts the verdict)', () => {
    // Same beats, but claim the verdict is Guilty while decisive beat points innocence.
    expect(checkCase(make({ verdict_truth: 'Guilty' })).join()).toMatch(
      /point to the true verdict/,
    )
  })

  it('flags a trap that points toward the true verdict instead of away from it', () => {
    const c = make({
      beats: make().beats.map((b) =>
        // make()'s trap is 'guilt' against a 'Not Guilty' truth (correctly misleading);
        // flip it to 'innocence' so it now reinforces the truth instead.
        b.reveal_stamp === 'misleading' ? { ...b, direction: 'innocence' } : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(/must point away from the true verdict/)
  })

  it('flags a misleading beat that secretly carries decisive weight', () => {
    const c = make({
      beats: make().beats.map((b) =>
        b.reveal_stamp === 'misleading'
          ? { ...b, surface_persuasion: 0.95, true_weight: 0.65 }
          : b,
      ),
    })
    expect(checkCase(c).join()).toMatch(
      /misleading beat .* must not carry decisive weight/,
    )
  })

  it('flags a case where decisive weight, not count, opposes the verdict', () => {
    // Three light decisive beats aligned with the verdict outnumber two heavy
    // ones against it (3 vs 2 by count), but the heavy pair outweighs them —
    // the case is unsolvable "on average" even though it looks fine by count.
    const c = make({
      verdict_truth: 'Guilty',
      beats: [
        beat({ id: 'b1', direction: 'innocence', reveal_stamp: 'misleading', surface_persuasion: 0.85, true_weight: 0.2 }),
        beat({ id: 'b2', direction: 'guilt', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 0.6 }),
        beat({ id: 'b3', direction: 'guilt', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 0.6 }),
        beat({ id: 'b4', direction: 'guilt', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 0.6 }),
        beat({ id: 'b5', direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 1 }),
        beat({ id: 'b6', direction: 'innocence', reveal_stamp: 'decisive', surface_persuasion: 0.3, true_weight: 1 }),
      ],
    })
    expect(checkCase(c).join()).toMatch(/point to the true verdict/)
  })
})

describe('checkQueue', () => {
  it('accepts a varied, unique queue', () => {
    const q = [
      make({ id: 'd-0001', publish_date: '2026-01-01', title: 'A' }),
      make({
        id: 'd-0002',
        publish_date: '2026-01-02',
        title: 'B',
        verdict_truth: 'Guilty',
        beats: [
          beat({ id: 'b1', direction: 'innocence', reveal_stamp: 'misleading', surface_persuasion: 0.8, true_weight: 0.2 }),
          beat({ id: 'b2', direction: 'guilt', reveal_stamp: 'decisive', surface_persuasion: 0.4, true_weight: 0.9 }),
          beat({ id: 'b3', direction: 'guilt', reveal_stamp: 'minor' }),
        ],
      }),
      make({ id: 'd-0003', publish_date: '2026-01-03', title: 'C' }),
    ]
    expect(checkQueue(q)).toEqual([])
  })

  it('flags duplicate ids and a single-verdict queue', () => {
    const q = [
      make({ id: 'd-0001', publish_date: '2026-01-01', title: 'A' }),
      make({ id: 'd-0001', publish_date: '2026-01-02', title: 'B' }),
      make({ id: 'd-0003', publish_date: '2026-01-03', title: 'C' }),
    ]
    const messages = checkQueue(q).map((i) => i.message)
    expect(messages.join()).toMatch(/duplicate id/)
    expect(messages.join()).toMatch(/same verdict/)
  })
})
