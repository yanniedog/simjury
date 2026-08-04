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
    expect(manifest.schema).toBe('simjury.scene-art-manifest/v2')
    expect(manifest.sessions.map((session) => session.sceneIds)).toEqual(
      elevenMinutesCourtWeek.manifest.sessions.map((session) =>
        session.scenes.map((scene) => scene.id)),
    )

    const sourcePaths = []
    for (const [sceneId, entry] of Object.entries(manifest.scenes)) {
      expect(entry.altDescription.length).toBeGreaterThan(20)
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        expect(entry.compositionArt[composition].focalPoint).toBeDefined()
        expect(entry.compositionArt[composition].permittedCaptionPositions.length).toBeGreaterThan(0)
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

  it('keeps per-composition presence and absent safe-region decisions explicit', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    const commissioned = new Set(Object.keys(SCENE_ART_AUTHORING))
    for (const [sceneId, entry] of Object.entries(manifest.scenes)) {
      if (commissioned.has(sceneId)) {
        for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
          expect(entry.compositionArt[composition].subjectSafeRegion).not.toBeUndefined()
          expect(entry.compositionArt[composition].evidenceSafeRegion).not.toBeUndefined()
        }
      } else {
        for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
          expect(entry.compositionArt[composition].subjectSafeRegion).toBeUndefined()
          expect(entry.compositionArt[composition].evidenceSafeRegion).toBeUndefined()
        }
      }
    }
  })

  it('does not invent visible evidence during legacy metadata migration', () => {
    const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
    const visibleEvidenceScenes = Object.entries(manifest.scenes)
      .filter(([, entry]) => Object.values(entry.compositionArt).some((direction) => direction.evidenceSafeRegion !== null && direction.evidenceSafeRegion !== undefined))
      .map(([sceneId]) => sceneId)
    expect(visibleEvidenceScenes).toEqual(['tue-recording'])
    expect(manifest.scenes['mon-adjourn'].compositionArt.portrait.subjectSafeRegion).toBeNull()
    expect(manifest.scenes['mon-arrival'].compositionArt.portrait.reviewStatus).toBe('compatibility-migration')
    expect(manifest.scenes['tue-recording'].compositionArt.portrait.reviewStatus).toBe('crop-reviewed')

    const evidenceNeutralReviewedScenes = [
      'tue-adjourn',
      'wed-resume',
      'wed-pell-chief',
      'wed-pell-cross',
      'wed-vos',
      'wed-vale',
      'wed-strike',
      'wed-crown-close',
      'wed-adjourn',
      'thu-opening',
      'thu-rusk-chief',
      'thu-rusk-cross',
      'thu-quill-chief',
      'thu-quill-cross',
      'thu-defence-record',
      'thu-def-close',
      'thu-adjourn',
      'fri-crown-close',
      'fri-defence-close',
    ]
    for (const sceneId of evidenceNeutralReviewedScenes) {
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        expect(manifest.scenes[sceneId].compositionArt[composition].evidenceSafeRegion).toBeNull()
        expect(manifest.scenes[sceneId].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      }
    }

    expect(manifest.scenes['tue-adjourn'].compositionArt.portrait.subjectSafeRegion).toBeNull()
    expect(manifest.scenes['wed-resume'].compositionArt.portrait.permittedCaptionPositions).toEqual(['top'])
    expect(manifest.scenes['wed-resume'].compositionArt.portrait.subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    expect(manifest.scenes['wed-adjourn'].compositionArt.portrait.subjectSafeRegion).toBeNull()
    expect(manifest.scenes['wed-adjourn'].compositionArt.portrait.evidenceSafeRegion).toBeNull()
    expect(manifest.scenes['thu-opening'].compositionArt.portrait.subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    expect(manifest.scenes['thu-rusk-chief'].compositionArt.portrait.subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    expect(manifest.scenes['thu-rusk-cross'].compositionArt.portrait.subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    expect(manifest.scenes['thu-quill-chief'].compositionArt.portrait.subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
      expect(manifest.scenes['thu-quill-cross'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['thu-defence-record'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['thu-def-close'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['thu-adjourn'].compositionArt[composition].subjectSafeRegion).toBeNull()
      expect(manifest.scenes['fri-crown-close'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-defence-close'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
    }
  })
})
