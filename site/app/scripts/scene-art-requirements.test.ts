import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { SCENE_ART_AUTHORING } from '../src/courtweek/content/sceneArt'
import { buildSceneArtManifestDraft } from './scene-art-requirements'

describe('SceneArtManifest contract', () => {
  it('keys a dedicated six-rendition contract to all 55 authored scenes', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    const sourceSceneIds = elevenMinutesCourtWeek.manifest.sessions
      .flatMap((session) => session.scenes.map((scene) => scene.id))
    expect(sourceSceneIds).toHaveLength(55)
    expect(Object.keys(manifest.scenes)).toEqual(sourceSceneIds)
    expect(manifest.sessions.map((session) => session.sceneIds)).toEqual(
      elevenMinutesCourtWeek.manifest.sessions.map((session) =>
        session.scenes.map((scene) => scene.id)),
    )

    const sourcePaths = []
    for (const [sceneId, entry] of Object.entries(manifest.scenes)) {
      expect(entry.altDescription.length).toBeGreaterThan(20)
      expect(entry.permittedCaptionPositions.length).toBeGreaterThan(0)
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        for (const format of ['avif', 'webp'] as const) {
          const path = entry.sources[composition][format]
          expect(path).toBe(`scenes/${sceneId}/${composition}.${format}`)
          expect(path).not.toContain('courtroom-')
          sourcePaths.push(path)
        }
      }
    }
    expect(new Set(sourcePaths).size).toBe(55 * 3 * 2)
    const tuesdayResume = elevenMinutesCourtWeek.manifest.sessions[1].scenes[0]
    expect(tuesdayResume.id).toBe('tue-resume')
    expect(tuesdayResume.visual.sources).toBeUndefined()
  })

  it('keeps commissioned and absent safe-region decisions explicit', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    const commissioned = new Set(Object.keys(SCENE_ART_AUTHORING))
    expect(commissioned.size).toBe(10)
    for (const [sceneId, entry] of Object.entries(manifest.scenes)) {
      if (commissioned.has(sceneId)) {
        expect(entry.subjectSafeRegion).not.toBeNull()
        expect(entry.evidenceSafeRegion).not.toBeNull()
      } else {
        expect(entry.subjectSafeRegion).toBeNull()
        expect(entry.evidenceSafeRegion).toBeNull()
      }
    }
  })
})
