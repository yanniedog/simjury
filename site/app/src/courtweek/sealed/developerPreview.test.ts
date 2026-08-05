import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  DEVELOPER_PREVIEW_NOW,
  developerProgressForDay,
  digestDeveloperToken,
  verifyDeveloperToken,
} from './developerPreview'

describe('developer preview boundary', () => {
  it('uses the domain-separated SHA-256 verifier', async () => {
    await expect(digestDeveloperToken('test')).resolves.toBe(
      'f7230d7ddca6d772015f4ac74141c6cc0a80e745895420731bc0ed6aeed0cbe1',
    )
    const fixture = 'A'.repeat(43)
    const fixtureDigest = await digestDeveloperToken(fixture)
    await expect(verifyDeveloperToken(fixture, fixtureDigest)).resolves.toBe(true)
    await expect(verifyDeveloperToken('B'.repeat(43), fixtureDigest)).resolves.toBe(false)
    await expect(verifyDeveloperToken('short', fixtureDigest)).resolves.toBe(false)
    await expect(verifyDeveloperToken('A'.repeat(44), fixtureDigest)).resolves.toBe(false)
    await expect(verifyDeveloperToken(fixture, fixtureDigest.slice(1))).resolves.toBe(false)
    await expect(verifyDeveloperToken(fixture, 'g'.repeat(64))).resolves.toBe(false)
  })

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
})
