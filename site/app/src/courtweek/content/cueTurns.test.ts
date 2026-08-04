import { describe, expect, it } from 'vitest'
import { courtWeekBootstrap } from '../sealed/bootstrap'
import { createCourtDayPacks } from '../sealed/packPlan'
import { elevenMinutesCourtWeek } from './elevenMinutes'

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
})
