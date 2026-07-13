import { describe, expect, it } from 'vitest'
import { docketCaseSchema } from './caseSchema'
import { makeDocketCase, makeJuror } from './fixtures'

describe('reaction rule direction constraint', () => {
  it('accepts a rule constrained to one argument direction', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[0].when.direction = 'guilt'
    c.jury.jurors[0] = j
    expect(docketCaseSchema.safeParse(c).success).toBe(true)
  })

  it('rejects an unknown direction value', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[0].when.direction = 'sideways' as never
    c.jury.jurors[0] = j
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })
})

describe('direction-constrained default rules', () => {
  it('a directioned catch-all is not a default rule', async () => {
    const { checkDocketCase } = await import('./caseQuality')
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[j.reaction_rules.length - 1].when.direction = 'guilt'
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/default reaction rule/)
  })
})
