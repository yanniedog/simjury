import { describe, expect, it } from 'vitest'
import {
  START_CONVICTION,
  analyzePlay,
  convictionBand,
  movedToward,
} from './game'
import type { TrialCase } from './caseSchema'

function beat(overrides: Partial<TrialCase['beats'][number]>) {
  return {
    id: 'b',
    kind: 'witness' as const,
    text: 't',
    surface_persuasion: 0.5,
    true_weight: 0.5,
    direction: 'guilt' as const,
    reveal_stamp: 'minor' as const,
    reveal_note: 'n',
    ...overrides,
  }
}

function trial(beats: TrialCase['beats'], verdict_truth: TrialCase['verdict_truth']): TrialCase {
  return {
    id: 'd-0001',
    publish_date: '2026-01-01',
    label: 'fiction',
    title: 'T',
    era: 'e',
    charge: 'c',
    elements: ['one', 'two'],
    beats,
    verdict_truth,
    twist: 'x',
    difficulty_target: 0.5,
    gen_meta: { model: 'm', prompt_version: 'p', reviewer: 'r', batch_pr: 'b' },
  }
}

describe('convictionBand', () => {
  it('splits the slider into three bands', () => {
    expect(convictionBand(0)).toBe('lean-innocent')
    expect(convictionBand(33)).toBe('lean-innocent')
    expect(convictionBand(34)).toBe('uncertain')
    expect(convictionBand(66)).toBe('uncertain')
    expect(convictionBand(67)).toBe('lean-guilty')
    expect(convictionBand(100)).toBe('lean-guilty')
  })
})

describe('movedToward', () => {
  it('guilt beats pull the slider up, innocence beats pull it down', () => {
    expect(movedToward('guilt', 50, 70)).toBe(true)
    expect(movedToward('guilt', 50, 40)).toBe(false)
    expect(movedToward('innocence', 50, 30)).toBe(true)
    expect(movedToward('innocence', 50, 60)).toBe(false)
  })
  it('a flat move is not swayed either way', () => {
    expect(movedToward('guilt', 50, 50)).toBe(false)
    expect(movedToward('innocence', 50, 50)).toBe(false)
  })
})

describe('analyzePlay', () => {
  const beats = [
    beat({ id: 'b1', direction: 'guilt', reveal_stamp: 'misleading' }),
    beat({ id: 'b2', direction: 'innocence', reveal_stamp: 'decisive' }),
    beat({ id: 'b3', direction: 'guilt', reveal_stamp: 'misleading' }),
  ]
  const t = trial(beats, 'Not Guilty')

  it('marks a matching verdict correct', () => {
    expect(analyzePlay(t, [60, 40, 45], 'Not Guilty').correct).toBe(true)
    expect(analyzePlay(t, [60, 40, 45], 'Guilty').correct).toBe(false)
  })

  it('counts the first beat against the neutral start', () => {
    // First beat is a guilt trap; rising from START (50) to 60 = took the bait.
    const [first] = analyzePlay(t, [60, 40, 45], 'Not Guilty').outcomes
    expect(first.before).toBe(START_CONVICTION)
    expect(first.after).toBe(60)
    expect(first.tookBait).toBe(true)
  })

  it('counts only misleading beats that pulled the juror their way', () => {
    // b1 guilt-trap: 50->70 (baited). b2 decisive (never a trap). b3 guilt-trap: 55->50 (resisted).
    const a = analyzePlay(t, [70, 55, 50], 'Not Guilty')
    expect(a.totalTraps).toBe(2)
    expect(a.swayedByTraps).toBe(1)
    expect(a.outcomes.map((o) => o.tookBait)).toEqual([true, false, false])
  })
})
