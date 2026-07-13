import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docketCaseSchema } from '../lib/v2/caseSchema'
import { makeDocketCase } from '../lib/v2/fixtures'
import { checkDynamics, strategies } from './dynamics'

describe('strategies', () => {
  it('builds the fixed strategy space from the case itself', () => {
    const s = strategies(makeDocketCase())
    expect(s.passive).toEqual([])
    expect(s.decisive.length).toBeGreaterThan(0)
    expect(s.trappy.length).toBeGreaterThan(0)
    expect(s.counsel.some((a) => a.type === 'cite_direction')).toBe(true)
  })
})

describe('checkDynamics', () => {
  it('passes a live room (programmatic fixture)', () => {
    expect(checkDynamics(makeDocketCase())).toEqual([])
  })

  it('passes the authored dd-0000', () => {
    const raw = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docket', 'dd-0000.json'),
      'utf8',
    )
    expect(checkDynamics(docketCaseSchema.parse(JSON.parse(raw)))).toEqual([])
  })

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
