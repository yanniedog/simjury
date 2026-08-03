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

  it('keeps absent safe-region decisions explicit instead of inventing art metadata', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    expect(Object.values(manifest.scenes).every((entry) => entry.subjectSafeRegion === null)).toBe(true)
    expect(Object.values(manifest.scenes).every((entry) => entry.evidenceSafeRegion === null)).toBe(true)
  })
})
