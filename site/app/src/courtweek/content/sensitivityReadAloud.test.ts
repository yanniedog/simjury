import { describe, expect, it } from 'vitest'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesCourtWeek } from './elevenMinutes'
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
  it('discloses the acted distress call before entry and preserves an exit choice', () => {
    expect(elevenMinutesCourtWeek.manifest.contentAdvisory).toMatch(/acted distress call/iu)
    expect(elevenMinutesCourtWeek.manifest.contentAdvisory).toMatch(/pause or leave/iu)
  })

  it('does not give a juror the same or near-identical spoken family name as a witness', () => {
    const witnessFamilyNames = new Set(
      elevenMinutesTrialRecord.witnesses.map(({ name }) => spokenFamilyName(name)),
    )
    const collisions = elevenMinutesDeliberation.jurors
      .map(({ name }) => name)
      .filter((name) => witnessFamilyNames.has(spokenFamilyName(name)))

    expect(collisions).toEqual([])
  })

  it('keeps runtime mechanics out of the named in-world cues', () => {
    const cues = new Map(elevenMinutesCourtWeek.manifest.sessions
      .flatMap(({ scenes }) => scenes)
      .flatMap(({ cues }) => cues)
      .map((cue) => [cue.id, cue]))

    for (const id of ['mon-adjourn-2', 'sat-separate-2', 'sun-analysis-close']) {
      expect(cues.get(id)?.speaker).toBe('Narrator')
    }
    expect(cues.get('sat-improper-1')?.text).not.toMatch(/influence|penalty|score/iu)
  })
})
