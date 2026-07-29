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

  it('lists misleading beats as post-verdict counterweights', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Not Guilty')
    expect(a.counterweights.length).toBeGreaterThan(0)
    expect(a.counterweights.every((r) => r.beat.reveal_stamp === 'misleading')).toBe(true)
  })

  it('lists misleading beats as counterweights for a Guilty verdict', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Guilty')
    expect(a.counterweights.length).toBeGreaterThan(0)
    expect(a.counterweights.every((r) => r.beat.reveal_stamp === 'misleading')).toBe(true)
  })

  it('scores a mismatched verdict as incorrect', () => {
    const a = analyzeDocketPlay(makeDocketCase(), 'Guilty')
    expect(a.matchesReference).toBe(false)
  })
})
