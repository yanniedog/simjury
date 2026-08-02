import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadDocketFiles } from '../../scripts/docket-files'
import { makeDocketCase } from '../lib/v2/fixtures'
import { checkDynamics, strategies } from './dynamics'

describe('strategies', () => {
  it('builds the fixed strategy space from the case itself', () => {
    const s = strategies(makeDocketCase())
    expect(s.passive).toEqual([])
    expect(s.decisive.length).toBeGreaterThan(0)
    expect(s.synthesis).toHaveLength(3)
    expect(s.trappy.length).toBeGreaterThan(0)
    expect(s.counsel.some((a) => a.type === 'cite_direction')).toBe(true)
  })
})

describe('checkDynamics', () => {
  it('passes a live room (programmatic fixture)', () => {
    expect(checkDynamics(makeDocketCase())).toEqual([])
  })

  it('passes every discoverable authored V3 case', () => {
    const docketDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'docket',
    )
    const docket = loadDocketFiles(docketDir)
    expect(docket.errors).toEqual([])
    for (const trial of docket.v3Cases) {
      expect(checkDynamics(trial), trial.id).toEqual([])
    }
  }, 30_000)

  it('flags a foregone-conclusion room', () => {
    const c = makeDocketCase()
    // Freeze the room: every juror committed guilty at full confidence with
    // rules that never move, so no strategy changes anything.
    c.jury.jurors = c.jury.jurors.map((j) => ({
      ...j,
      arc: 'principled_holdout' as const,
      initial: { position: 'G' as const, confidence: 100 },
      reaction_rules: [
        {
          when: { theme: 'any' as const, stance: 'any' as const },
          effect: { delta: 0, confidence: 0, line: 'pushback' as const },
        },
      ],
    }))
    expect(checkDynamics(c).join()).toMatch(/foregone conclusion/)
  })
})
