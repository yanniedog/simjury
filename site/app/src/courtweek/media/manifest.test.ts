import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from '../sealed/bootstrap'
import { createCourtDayPacks } from '../sealed/packPlan'
import {
  assertRuntimeMediaCoverage,
  attachSessionAudio,
  courtWeekRuntimeMediaManifestSchema,
} from './manifest'
import { completeRuntimeMediaFixture } from './runtimeManifest.fixture'

describe('pinned text-free Court Week media manifest', () => {
  it('strictly maps all 125 authored cues without carrying text or speakers', () => {
    const fixture = completeRuntimeMediaFixture()
    expect(() => assertRuntimeMediaCoverage(elevenMinutesCourtWeek, fixture)).not.toThrow()
    const mappings = fixture.sessions.flatMap((session) =>
      session.segments.flatMap((segment) => segment.cues))
    expect(mappings).toHaveLength(125)
    expect(new Set(mappings.map((cue) => cue.cue_id))).toHaveLength(125)
    expect(JSON.stringify(fixture)).not.toContain('speaker')
    expect(JSON.stringify(fixture)).not.toContain('accessibleProposition')

    const contaminated = structuredClone(fixture) as unknown as {
      sessions: Array<{ segments: Array<{ cues: Array<Record<string, unknown>> }> }>
    }
    contaminated.sessions[0].segments[0].cues[0].text = 'future dialogue'
    expect(() => courtWeekRuntimeMediaManifestSchema.parse(contaminated)).toThrow()
  })

  it('seals only each unlocked day audio map into that day pack', () => {
    const fixture = completeRuntimeMediaFixture()
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap, fixture)
    expect(packs.map((pack) => pack.media?.session_id)).toEqual(
      courtWeekBootstrap.sessions.map((session) => session.id),
    )
    const monday = JSON.stringify(packs[0].media)
    const tuesdayAsset = fixture.sessions[1].segments[0].sources.opus
    expect(monday).not.toContain(tuesdayAsset)
  })

  it('attaches each cue to one segment range and pinned codec URLs', () => {
    const fixture = completeRuntimeMediaFixture()
    const sessions = elevenMinutesCourtWeek.manifest.sessions.map((session) =>
      attachSessionAudio(
        session,
        fixture.sessions.find((media) => media.session_id === session.id),
        fixture.release_tag,
      ))
    const cues = sessions.flatMap((session) =>
      session.scenes.flatMap((scene) => scene.cues))
    expect(cues).toHaveLength(125)
    for (const cue of cues) {
      expect(cue.audio?.segmentId).toBeTruthy()
      expect(cue.audio?.endSeconds).toBeGreaterThan(cue.audio?.startSeconds ?? -1)
      expect(cue.audio?.opus).toMatch(/^https:\/\/github\.com\/yanniedog\/simjury\/releases\/download\//u)
      expect(cue.audio?.aac).toMatch(/\.m4a$/u)
      expect(cue.audio?.mp3).toMatch(/\.mp3$/u)
    }
  })
})
