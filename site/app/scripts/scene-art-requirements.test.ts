import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
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
  })

  it('keeps commissioned and absent safe-region decisions explicit', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    const monday = elevenMinutesCourtWeek.manifest.sessions[0].scenes.map((scene) => scene.id)
    expect(monday).toHaveLength(7)
    for (const sceneId of monday) {
      expect(manifest.scenes[sceneId].subjectSafeRegion).not.toBeNull()
      expect(manifest.scenes[sceneId].evidenceSafeRegion).not.toBeNull()
    }
    for (const entry of Object.values(manifest.scenes).slice(monday.length)) {
      expect(entry.subjectSafeRegion).toBeNull()
      expect(entry.evidenceSafeRegion).toBeNull()
    }
  })
})
