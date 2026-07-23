import { describe, expect, it } from 'vitest'
import { makeDocketCase } from './fixtures'
import { caseStorageId } from './caseRevision'

describe('caseStorageId', () => {
  it('is stable for identical authored content', () => {
    const trial = makeDocketCase()
    expect(caseStorageId(trial)).toBe(caseStorageId(structuredClone(trial)))
  })

  it('changes when published case content is revised', () => {
    const trial = makeDocketCase()
    const revised = structuredClone(trial)
    revised.hook = `${revised.hook} Revised.`
    expect(caseStorageId(revised)).not.toBe(caseStorageId(trial))
  })
})
