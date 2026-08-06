import { describe, expect, it } from 'vitest'
import { courtWeekBootstrap } from '../sealed/bootstrap'
import { createCourtDayPacks } from '../sealed/packPlan'
import { splitCueTurns } from './cueTurns'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import { REVIEWED_MULTI_SPEAKER_TURNS } from './speakerIntegrity'

function speakerTurns(sourceCueId: string): string[] {
  const turns = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    .flatMap((pack) => pack.session.scenes)
    .flatMap((scene) => scene.cues)
    .filter((cue) => (cue.sourceCueId ?? cue.id) === sourceCueId)
    .flatMap((cue) => cue.turns ?? [])
  expect(turns.length).toBeGreaterThan(1)
  expect(new Set(turns.map((turn) => turn.id))).toHaveLength(turns.length)
  return turns.map((turn) => turn.speaker)
    .filter((speaker, index, speakers) => index === 0 || speaker !== speakers[index - 1])
}

describe('sealed spoken-turn contract', () => {
  it('preserves actual actor order within representative atomic legal cues', () => {
    expect(speakerTurns('mon-orr-cross-1')).toEqual([
      'Defence counsel Corin Dax', 'Nella Orr',
      'Defence counsel Corin Dax', 'Nella Orr',
    ])
    expect(speakerTurns('tue-dorn-re-1')).toEqual([
      'Crown counsel Asha Renn', 'Peli Dorn',
      'Crown counsel Asha Renn', 'Peli Dorn', 'Judge Sel Aven',
    ])
    expect(speakerTurns('wed-blurt')).toEqual([
      'Defence counsel Corin Dax', 'Oren Vale', 'Defence counsel Corin Dax',
    ])
    expect(speakerTurns('thu-crown-objection')).toEqual([
      'Defence counsel Corin Dax', 'Crown counsel Asha Renn', 'Judge Sel Aven',
    ])
  })

  it('matches the reviewed actor order for every multi-party authored cue', () => {
    const actual = new Map<string, string[]>()

    for (const session of elevenMinutesCourtWeek.manifest.sessions) {
      for (const scene of session.scenes) {
        const authored = scene.cues.reduce<typeof scene.cues>((groups, cue) => {
          const sourceCueId = cue.sourceCueId ?? cue.id
          const current = groups.at(-1)
          if (current && (current.sourceCueId ?? current.id) === sourceCueId) {
            current.text += ` ${cue.text}`
          } else {
            groups.push({ ...cue, id: sourceCueId, sourceCueId: undefined })
          }
          return groups
        }, [])
        for (const cue of authored) {
          const speakers = splitCueTurns(cue).map((turn) => turn.speaker)
          if (speakers.length > 1) actual.set(cue.id, speakers)
        }
      }
    }

    expect(actual).toEqual(REVIEWED_MULTI_SPEAKER_TURNS)
  })

  it('does not paraphrase a present character speaking in another character voice', () => {
    const spokenText = elevenMinutesCourtWeek.manifest.sessions
      .flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues)
      .map((cue) => cue.text)
      .join(' ')

    expect(spokenText).not.toMatch(/the accused answers|Sola Iven answers|Kessa Noor adds|Yara Merrow asks|Someone says|Another voice asks|Edda stops|The court officer recalls|the clerk asks/iu)
  })
})
