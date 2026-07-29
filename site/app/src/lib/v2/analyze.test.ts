import { describe, expect, it } from 'vitest'
import { analyzeDocketPlay } from './analyze'
import { makeDocketCase } from './fixtures'

describe('analyzeDocketPlay', () => {
  it('scores a matching verdict as correct and lists decisive beats', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Not Guilty')
    expect(a.matchesReference).toBe(true)
    expect(a.whatMattered.every((r) => r.beat.reveal_stamp === 'decisive')).toBe(true)
    expect(a.whatMattered.length).toBeGreaterThan(0)
    expect(a.reveals).toHaveLength(makeDocketCase().beats.length)
  })

  it('lists every misleading beat as a post-verdict counterweight for either verdict', () => {
    for (const verdict of ['Not Guilty', 'Guilty'] as const) {
      const trial = makeDocketCase()
      const expected = trial.beats
        .filter((beat) => beat.reveal_stamp === 'misleading')
        .map((beat) => beat.id)
      const a = analyzeDocketPlay(trial, verdict)
      expect(expected.length).toBeGreaterThan(0)
      expect(a.counterweights.map((r) => r.beat.id)).toEqual(expected)
      expect(a.counterweights.every((r) => r.beat.reveal_stamp === 'misleading')).toBe(true)
    }
  })

  it('scores a mismatched verdict as incorrect', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Guilty')
    expect(a.matchesReference).toBe(false)
  })
})
