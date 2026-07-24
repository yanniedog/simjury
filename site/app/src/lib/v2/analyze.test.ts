import { describe, expect, it } from 'vitest'
import { analyzeDocketPlay } from './analyze'
import { makeDocketCase } from './fixtures'

describe('analyzeDocketPlay', () => {
  it('scores a matching verdict as correct and lists decisive beats', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Not Guilty')
    expect(a.correct).toBe(true)
    expect(a.whatMattered.every((r) => r.beat.reveal_stamp === 'decisive')).toBe(true)
    expect(a.whatMattered.length).toBeGreaterThan(0)
    expect(a.reveals).toHaveLength(makeDocketCase().beats.length)
  })

  it('scores a mismatched verdict as incorrect', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Guilty')
    expect(a.correct).toBe(false)
  })
})
