import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  DEVELOPER_PREVIEW_NOW,
  developerProgressForDay,
  withDeveloperFreshUnanimityBallot,
} from './developerPreview'

describe('developer preview boundary', () => {
  it('starts each selected day at its first cue with only the preceding days completed', () => {
    for (const session of elevenMinutesCourtWeek.manifest.sessions) {
      const progress = developerProgressForDay(elevenMinutesCourtWeek, session.ordinal)
      expect(progress.highestObservedTime).toBe(new Date(DEVELOPER_PREVIEW_NOW).toISOString())
      expect(progress.completedSessionIds).toEqual(
        elevenMinutesCourtWeek.manifest.sessions.slice(0, session.ordinal - 1).map(({ id }) => id),
      )
      expect(progress.currentSessionId).toBe(session.id)
      expect(progress.currentSceneId).toBe(session.scenes[0].id)
      expect(progress.currentCueId).toBe(session.scenes[0].cues[0].id)
      expect(progress.provisionalVote).toBe(session.ordinal === 7 ? 'unable-to-agree' : undefined)
    }
  })

  it('seeds an explicit cue, access mode, ballot and returned outcome', () => {
    const progress = developerProgressForDay(elevenMinutesCourtWeek, 7, {
      sceneId: 'sun-analysis', cueId: 'sun-analysis', accessMode: 'captions', ballot: 'not-guilty', outcome: 'not-guilty:unanimous',
    })
    expect(progress).toMatchObject({ currentSceneId: 'sun-analysis', currentCueId: 'sun-analysis', accessibilityMode: 'captions', provisionalVote: 'not-guilty',
      sealedVerdict: 'not-guilty', sealedAgreement: 'unanimous', openCourtVerdictReturned: true, returnedVerdict: 'not-guilty' })
    expect(progress.freshUnanimityVote).toBeUndefined()
  })

  it('prepares only the dev/test future journey for a distinct fresh ballot', () => {
    const revised = withDeveloperFreshUnanimityBallot(elevenMinutesCourtWeek)
    const sunday = revised.manifest.sessions[6]
    const freshIndex = sunday.scenes.findIndex(({ id }) => id === 'sun-fresh-unanimity-ballot')
    expect(freshIndex).toBe(sunday.scenes.findIndex(({ id }) => id === 'sun-majority') - 1)
    expect(sunday.scenes[freshIndex]).toMatchObject({
      interaction: { kind: 'fresh-unanimity-vote' },
      cues: [{ event: 'fresh-unanimity-ballot' }],
    })

    const atFresh = developerProgressForDay(revised, 7, {
      sceneId: 'sun-fresh-unanimity-ballot', ballot: 'not-guilty',
    })
    expect(atFresh).toMatchObject({ secondVote: 'not-guilty', secondBallotWasUnanimous: false })
    expect(atFresh.freshUnanimityVote).toBeUndefined()
    expect(developerProgressForDay(revised, 7, {
      sceneId: 'sun-majority', ballot: 'not-guilty',
    })).toMatchObject({ freshUnanimityVote: 'not-guilty', freshBallotWasUnanimous: false })
  })
})
