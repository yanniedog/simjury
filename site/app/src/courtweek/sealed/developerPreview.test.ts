import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  DEVELOPER_PREVIEW_NOW,
  developerProgressForDay,
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
  })
})
