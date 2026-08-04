import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from '../sealed/bootstrap'
import { createCourtDayPacks } from '../sealed/packPlan'
import {
  assertRuntimeMediaCoverage,
  attachSessionArt,
  attachSessionAudio,
  courtWeekRuntimeMediaManifestSchema,
} from './manifest'
import { completeRuntimeMediaFixture } from './runtimeManifest.fixture'
import { RUNTIME_DEPENDENT_CUE_IDS } from './runtimeCues'

describe('pinned text-free Court Week media manifest', () => {
  it('strictly maps all prerecorded cues and 55 scenes without carrying authored prose', () => {
    const fixture = completeRuntimeMediaFixture()
    expect(() => assertRuntimeMediaCoverage(elevenMinutesCourtWeek, fixture)).not.toThrow()
    const mappings = fixture.sessions.flatMap((session) =>
      session.segments.flatMap((segment) => segment.cues))
    const prerecordedCueIds = elevenMinutesCourtWeek.manifest.sessions
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id)))
      .filter((cueId) => !RUNTIME_DEPENDENT_CUE_IDS.has(cueId))
    expect(mappings).toHaveLength(prerecordedCueIds.length)
    expect(new Set(mappings.map((cue) => cue.cue_id))).toHaveLength(prerecordedCueIds.length)
    expect([...RUNTIME_DEPENDENT_CUE_IDS].every((cueId) =>
      !mappings.some((cue) => cue.cue_id === cueId))).toBe(true)
    const artMappings = fixture.sessions.flatMap((session) =>
      session.art.strips.flatMap((strip) => strip.scene_slots))
    expect(artMappings).toHaveLength(55)
    expect(fixture.sessions.flatMap((session) => session.art.strips)).toHaveLength(28)
    expect(JSON.stringify(fixture)).not.toContain('speaker')
    expect(JSON.stringify(fixture)).not.toContain('accessibleProposition')

    const contaminated = structuredClone(fixture) as unknown as {
      sessions: Array<{ segments: Array<{ cues: Array<Record<string, unknown>> }> }>
    }
    contaminated.sessions[0].segments[0].cues[0].text = 'future dialogue'
    expect(() => courtWeekRuntimeMediaManifestSchema.parse(contaminated)).toThrow()
  })

  it('seals only each unlocked day audio and art map into that day pack', () => {
    const fixture = completeRuntimeMediaFixture()
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap, fixture)
    expect(packs.map((pack) => pack.media?.session_id)).toEqual(
      courtWeekBootstrap.sessions.map((session) => session.id),
    )
    const monday = JSON.stringify(packs[0].media)
    const tuesdayAsset = fixture.sessions[1].segments[0].sources.opus
    const tuesdayArt = fixture.sessions[1].art.strips[0].sources.desktop.avif
    expect(monday).not.toContain(tuesdayAsset)
    expect(monday).not.toContain(tuesdayArt)
  })

  it('rejects art that reorders cells or omits a reviewed scene', () => {
    const reordered = completeRuntimeMediaFixture()
    reordered.sessions[0].art.strips[0].scene_slots.reverse()
    expect(() => assertRuntimeMediaCoverage(elevenMinutesCourtWeek, reordered)).toThrow(
      'non-chronological cell map',
    )

    const missing = completeRuntimeMediaFixture()
    missing.sessions[1].art.strips[3].scene_slots.pop()
    expect(() => assertRuntimeMediaCoverage(elevenMinutesCourtWeek, missing)).toThrow(
      'does not map its exact scene order',
    )
  })

  it('attaches each prerecorded cue to one segment range and pinned codec URLs', () => {
    const fixture = completeRuntimeMediaFixture()
    const sessions = elevenMinutesCourtWeek.manifest.sessions.map((session) =>
      attachSessionAudio(
        session,
        fixture.sessions.find((media) => media.session_id === session.id),
        fixture.release_tag,
      ))
    const cues = sessions.flatMap((session) =>
      session.scenes.flatMap((scene) => scene.cues))
    expect(cues.map((cue) => cue.id)).toEqual(elevenMinutesCourtWeek.manifest.sessions
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id))))
    for (const cue of cues) {
      if (RUNTIME_DEPENDENT_CUE_IDS.has(cue.id)) {
        expect(cue.audio).toBeUndefined()
        continue
      }
      expect(cue.audio?.segmentId).toBeTruthy()
      expect(cue.audio?.endSeconds).toBeGreaterThan(cue.audio?.startSeconds ?? -1)
      expect(cue.audio?.opus).toMatch(/^https:\/\/github\.com\/yanniedog\/simjury\/releases\/download\//u)
      expect(cue.audio?.aac).toMatch(/\.m4a$/u)
      expect(cue.audio?.mp3).toMatch(/\.mp3$/u)
    }
  })

  it('rejects drift between encrypted authored turns and opaque media timing', () => {
    const fixture = completeRuntimeMediaFixture()
    const monday = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap, fixture)[0]
    const mapped = fixture.sessions[0].segments.flatMap((segment) => segment.cues)
      .find((cue) => cue.cue_id === 'mon-orr-cross-1')!
    mapped.turns[0].turn_id = 'wrong-turn'
    expect(() => attachSessionAudio(monday.session, fixture.sessions[0], fixture.release_tag))
      .toThrow('Pinned spoken turns do not match reviewed cue mon-orr-cross-1')
  })

  it('attaches every scene to its sealed strip cell and pinned image URLs', () => {
    const fixture = completeRuntimeMediaFixture()
    const scenes = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) =>
      attachSessionArt(
        session,
        fixture.sessions.find((media) => media.session_id === session.id),
        fixture.release_tag,
      ).scenes)
    expect(scenes).toHaveLength(55)
    for (const scene of scenes) {
      expect(scene.visual.runtimeStrip?.cell).toBeGreaterThanOrEqual(0)
      expect(scene.visual.runtimeStrip?.cell).toBeLessThanOrEqual(1)
      expect(scene.visual.runtimeStrip?.sources.portrait.avif).toMatch(
        /^https:\/\/github\.com\/yanniedog\/simjury\/releases\/download\/.*\/[0-9a-f]{64}\.avif$/u,
      )
      expect(scene.visual.runtimeStrip?.sources.desktop.webp).toMatch(/\.webp$/u)
    }
  })
})
