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
    expect(visibleEvidenceScenes).toEqual(['tue-recording', 'fri-evidence-limits', 'sat-note'])
    expect(manifest.scenes['mon-adjourn'].compositionArt.portrait.subjectSafeRegion).toBeNull()
    expect(manifest.scenes['mon-arrival'].compositionArt.portrait.reviewStatus).toBe('compatibility-migration')
    expect(manifest.scenes['tue-recording'].compositionArt.portrait.reviewStatus).toBe('crop-reviewed')

    const evidenceNeutralReviewedScenes = [
      'tue-resume',
      'tue-dorn-chief',
      'tue-dorn-cross',
      'tue-dorn-re',
      'tue-mir-chief',
      'tue-mir-cross',
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
      'fri-legal-submissions',
      'fri-crown-close',
      'fri-defence-close',
      'fri-burden',
      'fri-murder-trail',
      'fri-manslaughter-trail',
      'fri-retire',
      'sat-room',
      'sat-concerns',
      'sat-provisional',
      'sun-final-ballot',
      'sat-first-ballot',
      'sat-causation',
      'sat-improper',
      'sun-resume',
      'sun-negligence',
      'sat-separate',
      'sun-second-ballot',
      'sun-majority',
      'sun-verdict',
      'sun-persevere',
    ]
    for (const sceneId of evidenceNeutralReviewedScenes) {
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        expect(manifest.scenes[sceneId].compositionArt[composition].evidenceSafeRegion).toBeNull()
        expect(manifest.scenes[sceneId].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      }
    }

    expect(manifest.scenes['tue-adjourn'].compositionArt.portrait.subjectSafeRegion).toBeNull()
    const tuesdayCropDirections = {
      'tue-resume': {
        portrait: [{ x: 50, y: 48 }, { x: 0, y: 37, width: 100, height: 49 }, 'top'],
        tablet: [{ x: 50, y: 47 }, { x: 0, y: 33, width: 100, height: 53 }, 'top'],
        desktop: [{ x: 50, y: 47 }, { x: 0, y: 31, width: 100, height: 59 }, 'top'],
      },
      'tue-dorn-chief': {
        portrait: [{ x: 52, y: 49 }, { x: 0, y: 36, width: 100, height: 50 }, 'top'],
        tablet: [{ x: 52, y: 47 }, { x: 0, y: 28, width: 100, height: 59 }, 'top'],
        desktop: [{ x: 52, y: 46 }, { x: 0, y: 28, width: 100, height: 64 }, 'top'],
      },
      'tue-dorn-cross': {
        portrait: [{ x: 53, y: 48 }, { x: 6, y: 25, width: 94, height: 43 }, 'bottom'],
        tablet: [{ x: 52, y: 46 }, { x: 12, y: 22, width: 80, height: 45 }, 'bottom'],
        desktop: [{ x: 57, y: 44 }, { x: 28, y: 9, width: 58, height: 59 }, 'bottom'],
      },
      'tue-dorn-re': {
        portrait: [{ x: 52, y: 49 }, { x: 0, y: 36, width: 100, height: 50 }, 'top'],
        tablet: [{ x: 52, y: 47 }, { x: 0, y: 28, width: 100, height: 59 }, 'top'],
        desktop: [{ x: 52, y: 46 }, { x: 0, y: 27, width: 100, height: 65 }, 'top'],
      },
      'tue-mir-chief': {
        portrait: [{ x: 52, y: 49 }, { x: 0, y: 36, width: 100, height: 50 }, 'top'],
        tablet: [{ x: 52, y: 47 }, { x: 0, y: 28, width: 100, height: 59 }, 'top'],
        desktop: [{ x: 52, y: 46 }, { x: 0, y: 28, width: 100, height: 64 }, 'top'],
      },
      'tue-mir-cross': {
        portrait: [{ x: 53, y: 48 }, { x: 7, y: 26, width: 93, height: 42 }, 'bottom'],
        tablet: [{ x: 52, y: 46 }, { x: 12, y: 22, width: 80, height: 45 }, 'bottom'],
        desktop: [{ x: 62, y: 43 }, { x: 37, y: 17, width: 49, height: 51 }, 'bottom'],
      },
    } as const
    for (const [sceneId, directions] of Object.entries(tuesdayCropDirections)) {
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        const [focalPoint, subjectSafeRegion, captionPosition] = directions[composition]
        expect(manifest.scenes[sceneId].compositionArt[composition]).toMatchObject({
          focalPoint,
          subjectSafeRegion,
          evidenceSafeRegion: null,
          permittedCaptionPositions: [captionPosition],
          reviewStatus: 'crop-reviewed',
        })
      }
    }
    expect(manifest.scenes['tue-dorn-chief'].altDescription).toContain('no distress words, console status or inference about intent')
    expect(manifest.scenes['tue-dorn-cross'].altDescription).toContain('does not resolve the room noise, competing incidents or her reliability')
    expect(manifest.scenes['tue-dorn-re'].altDescription).toContain('no competing incident, inference or enhancement')
    expect(manifest.scenes['tue-mir-chief'].altDescription).toContain('no audit-log content, launch-strip words, time or state of mind')
    expect(manifest.scenes['tue-mir-cross'].altDescription).toContain('No log is depicted as infallible, worthless or proof of state of mind')
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
      expect(manifest.scenes['fri-legal-submissions'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-crown-close'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-defence-close'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-burden'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-murder-trail'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-manslaughter-trail'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-evidence-limits'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['fri-evidence-limits'].compositionArt[composition].evidenceSafeRegion).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
      expect(manifest.scenes['fri-evidence-limits'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['fri-retire'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-room'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-room'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-room'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-room'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-concerns'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-concerns'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-concerns'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-concerns'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-provisional'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-provisional'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-provisional'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-provisional'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-final-ballot'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-final-ballot'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-final-ballot'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-final-ballot'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-first-ballot'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-first-ballot'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-first-ballot'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-first-ballot'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-causation'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-causation'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-causation'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-causation'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-improper'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-improper'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-improper'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-improper'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-note'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-note'].compositionArt[composition].evidenceSafeRegion).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
      expect(manifest.scenes['sat-note'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-note'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-resume'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-resume'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-resume'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-resume'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-negligence'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-negligence'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-negligence'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-negligence'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sat-separate'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sat-separate'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sat-separate'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sat-separate'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-second-ballot'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-second-ballot'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-second-ballot'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-second-ballot'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-analysis'].compositionArt[composition].subjectSafeRegion).toBeNull()
      expect(manifest.scenes['sun-analysis'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-analysis'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-analysis'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-majority'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-majority'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-majority'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-majority'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-verdict'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-verdict'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-verdict'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-verdict'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
      expect(manifest.scenes['sun-persevere'].compositionArt[composition].subjectSafeRegion).toMatchObject({ x: 0, width: 100 })
      expect(manifest.scenes['sun-persevere'].compositionArt[composition].evidenceSafeRegion).toBeNull()
      expect(manifest.scenes['sun-persevere'].compositionArt[composition].permittedCaptionPositions).toEqual(['top'])
      expect(manifest.scenes['sun-persevere'].compositionArt[composition].reviewStatus).toBe('crop-reviewed')
    }
    expect(manifest.scenes['sat-room'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-room'].altDescription).toContain('No ballot is shown')
    expect(manifest.scenes['sat-concerns'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-concerns'].altDescription).toContain('No faction, ballot or verdict is shown')
    expect(manifest.scenes['sat-provisional'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-provisional'].altDescription).toContain('private face-down blank ballot card')
    expect(manifest.scenes['sat-provisional'].altDescription).toContain('No individual position, aggregate count, faction or verdict cue is visible')
    expect(manifest.scenes['sun-final-ballot'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sun-final-ballot'].altDescription).toContain('private face-down blank ballot card')
    expect(manifest.scenes['sun-final-ballot'].altDescription).toContain('No individual position, aggregate count, faction, outcome or verdict cue is visible')
    expect(manifest.scenes['sat-first-ballot'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-first-ballot'].altDescription).toContain('No seat-level position is visible')
    expect(manifest.scenes['sat-causation'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-causation'].altDescription).toContain('evidence-first causation discussion')
    expect(manifest.scenes['sat-causation'].altDescription).toContain('no readable evidence, ballot, faction, verdict or conclusion is shown')
    expect(manifest.scenes['sat-improper'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sat-improper'].altDescription).toContain('No forbidden allegation, evidence, ballot, count, faction or verdict is visible')
    expect(manifest.scenes['sat-note'].altDescription).toContain('folded face-down unmarked jury note')
    expect(manifest.scenes['sat-note'].altDescription).toContain('No writing, ballot number, juror identity, position or verdict is visible')
    expect(manifest.scenes['sun-resume'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sun-resume'].altDescription).toContain('Sunday morning light')
    expect(manifest.scenes['sun-resume'].altDescription).toContain('No ballot, evidence, faction, verdict or conclusion is shown')
    expect(manifest.scenes['sun-negligence'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sun-negligence'].altDescription).toContain('No spectrum, midpoint, ballot, count, faction, verdict or conclusion is shown')
    expect(manifest.scenes['sat-separate'].altDescription).toContain('overnight separation direction')
    expect(manifest.scenes['sat-separate'].altDescription).toContain('No departure, outside research, saved state, ballot count, legal text or verdict is shown')
    expect(manifest.scenes['sun-second-ballot'].altDescription).toContain('Exactly eleven other jurors')
    expect(manifest.scenes['sun-second-ballot'].altDescription).toContain('second private face-down blank ballot card')
    expect(manifest.scenes['sun-second-ballot'].altDescription).toContain('No individual choice, count, aggregate, faction, verdict, label or readable card is visible')
    expect(manifest.scenes['sun-analysis'].altDescription).toContain('No verdict, count or preferred analysis is shown')
    expect(manifest.scenes['sun-analysis'].altDescription).toContain('two lawful readings appear only in the live interface')
    expect(manifest.scenes['sun-majority'].altDescription).toContain('numerical rule and later jury-room discussion appear only in audio and the live interface')
    expect(manifest.scenes['sun-majority'].altDescription).toContain('no threshold, pressure gesture, lone juror, count, faction, verdict or outcome is visible')
    expect(manifest.scenes['sun-verdict'].altDescription).toContain('standing accused, Mara Venn')
    expect(manifest.scenes['sun-verdict'].altDescription).toContain('No verdict, count, restraint, reaction, guilt cue or analysis is shown')
    expect(manifest.scenes['sun-verdict'].compositionArt.portrait.subjectSafeRegion).toEqual({ x: 0, y: 34, width: 100, height: 49 })
    expect(manifest.scenes['sun-persevere'].altDescription).toContain('one further honest effort')
    expect(manifest.scenes['sun-persevere'].altDescription).toContain('does not pressure any juror or show a count, faction, verdict or outcome')
    expect(manifest.scenes['sun-persevere'].altDescription).toContain('later jury-room reasoning appears only in audio and the live interface')
  })
})
