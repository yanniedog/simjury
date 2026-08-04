import { describe, expect, it } from 'vitest'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesTrialRecord } from './trialRecord'

function spokenFamilyName(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .at(-1)!
    .toLocaleLowerCase('en-AU')
    .replace(/(.)\1+/gu, '$1')
}

describe('sensitivity and read-aloud identity review', () => {
  it('does not give a juror the same or near-identical spoken family name as a witness', () => {
    const witnessFamilyNames = new Set(
      elevenMinutesTrialRecord.witnesses.map(({ name }) => spokenFamilyName(name)),
    )
    const collisions = elevenMinutesDeliberation.jurors
      .map(({ name }) => name)
      .filter((name) => witnessFamilyNames.has(spokenFamilyName(name)))

    expect(collisions).toEqual([])
  })
})
