import { describe, expect, it } from 'vitest'
import { hashSeed, mulberry32, pick, rngFor } from './rng'

describe('rng', () => {
  it('hashes seeds stably', () => {
    expect(hashSeed('dd-0000:guilty')).toBe(hashSeed('dd-0000:guilty'))
    expect(hashSeed('dd-0000:guilty')).not.toBe(hashSeed('dd-0000:not_guilty'))
  })

  it('produces an identical stream for an identical seed', () => {
    const a = mulberry32(hashSeed('x'))
    const b = mulberry32(hashSeed('x'))
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
  })

  it('stays in [0, 1)', () => {
    const r = rngFor('bounds')
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('picks deterministically', () => {
    expect(pick(rngFor('p'), ['a', 'b', 'c'])).toBe(pick(rngFor('p'), ['a', 'b', 'c']))
  })
})
