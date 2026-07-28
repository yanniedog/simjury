import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../lib/v2/fixtures'
import {
  actionForConcern,
  interpretLegacyConcern,
  legacyLanguagePack,
} from './legacyConcernMatcher'

describe('legacy concern bridge', () => {
  it('maps natural juror language to a relevant issue and sitting point', () => {
    const trial = makeDocketCase()
    const identityBeat = trial.beats.find(({ tags }) => tags.includes('identity'))!
    const concern = interpretLegacyConcern(
      trial,
      [],
      "I don't trust the witness's identification.",
      trial.beats[0].id,
      4,
    )
    expect(concern.understanding.frame).toMatchObject({
      issueId: 'identity',
      targetSeat: 4,
    })
    expect(concern.beatId).toBe(identityBeat.id)
    expect(concern.clarification).toBeNull()
  })

  it('asks honestly about an unmatched unique opinion', () => {
    const trial = makeDocketCase()
    const concern = interpretLegacyConcern(
      trial,
      [],
      'The blue curtains change everything.',
      trial.beats[2].id,
    )
    expect(concern.beatId).toBe(trial.beats[2].id)
    expect(concern.clarification).toContain("don't want to put words in your mouth")
  })

  it('uses notes and speaker names as evidence aliases', () => {
    const trial = makeDocketCase()
    const beat = trial.beats[0]
    const pack = legacyLanguagePack(trial, [{
      ownerId: 'player',
      beatId: beat.id,
      text: 'The witness hesitated about midnight.',
    }])
    expect(pack.evidence[0].aliases).toContain('The witness hesitated about midnight.')
    expect(pack.evidence[0].aliases).toContain(
      trial.cast.find(({ id }) => id === beat.speaker)?.name,
    )
  })

  it('translates the juror claim without exposing the authored beat direction', () => {
    const trial = makeDocketCase()
    const concern = interpretLegacyConcern(
      trial,
      [],
      'The identity evidence raises reasonable doubt.',
      trial.beats[0].id,
    )
    const action = actionForConcern(trial, concern, 'NG', 'J-04')
    expect(action).toMatchObject({
      type: 'argue',
      beatId: concern.beatId,
      push: 'innocence',
      targetJurorId: 'J-04',
      summary: 'The identity evidence raises reasonable doubt.',
    })
  })

  it('keeps an open question neutral instead of consulting the authored answer', () => {
    const trial = makeDocketCase()
    const concern = interpretLegacyConcern(
      trial,
      [],
      'Could someone explain what this record actually proves?',
      trial.beats[0].id,
    )
    expect(actionForConcern(trial, concern, 'U')).toMatchObject({
      type: 'argue',
      push: 'neutral',
    })
  })
})
