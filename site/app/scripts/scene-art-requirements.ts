import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import type { CourtWeek } from '../src/courtweek/model/schema'

export const SCENE_ART_SCHEMA = 'simjury.scene-art-manifest/v1' as const
const COMPOSITIONS = ['portrait', 'tablet', 'desktop'] as const
const FORMATS = ['avif', 'webp'] as const

export interface ArtRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ReleaseReadySceneArt {
  altDescription: string
  focalPoint: { x: number; y: number }
  subjectSafeRegion: ArtRegion
  evidenceSafeRegion: ArtRegion
  permittedCaptionPositions: Array<'top' | 'bottom' | 'left' | 'right'>
  sources: Record<typeof COMPOSITIONS[number], Record<typeof FORMATS[number], string>>
}

type DraftSceneArt = Omit<ReleaseReadySceneArt, 'subjectSafeRegion' | 'evidenceSafeRegion'> & {
  subjectSafeRegion: ArtRegion | null
  evidenceSafeRegion: ArtRegion | null
  currentFallbackId: string
}

export interface SceneArtManifestDraft {
  schema: typeof SCENE_ART_SCHEMA
  caseId: 'cw-0001'
  sourceRevision: string
  compositionContract: {
    portrait: { aspectRatio: '9:16'; minimumPixels: { width: 720; height: 1280 } }
    tablet: { aspectRatio: '4:3'; minimumPixels: { width: 1024; height: 768 } }
    desktop: { aspectRatio: '16:9'; minimumPixels: { width: 1280; height: 720 } }
  }
  scenes: Record<string, DraftSceneArt>
}

/**
 * Add reviewed safe regions here as art is commissioned. Source filenames are
 * fixed by convention and are never silently inherited from another scene.
 */
export const SCENE_ART_AUTHORING: Readonly<Record<string, Partial<Pick<
  ReleaseReadySceneArt,
  'altDescription' | 'focalPoint' | 'subjectSafeRegion' | 'evidenceSafeRegion' | 'permittedCaptionPositions'
>>>> = {
  'mon-arrival': {
    altDescription: 'Juror-seat view of the settled courtroom before evidence, with judge, separated counsel tables and the accused shown neutrally.',
    focalPoint: { x: 50, y: 44 },
    subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-oath': {
    altDescription: 'Juror-seat view of the judge and an officer of the court addressing the jury before evidence; neither oath nor affirmation is visually preferred.',
    focalPoint: { x: 50, y: 42 },
    subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-crown-opening': {
    altDescription: 'Crown counsel addresses the jury while defence counsel and the accused remain seated separately; posture and lighting express no view about guilt.',
    focalPoint: { x: 40, y: 46 },
    subjectSafeRegion: { x: 12, y: 18, width: 76, height: 62 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-orr-chief': {
    altDescription: 'Operations supervisor Nella Orr gives evidence from the witness box while Crown counsel questions her; no route information is shown in the artwork.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-orr-cross': {
    altDescription: 'Nella Orr remains in the witness box as defence counsel questions her from the opposing lectern; no disputed proposition is resolved visually.',
    focalPoint: { x: 54, y: 46 },
    subjectSafeRegion: { x: 12, y: 20, width: 76, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-elements': {
    altDescription: 'The judge gives preliminary directions from the bench to the jury; no legal element, inference or verdict is depicted as answered.',
    focalPoint: { x: 50, y: 38 },
    subjectSafeRegion: { x: 20, y: 16, width: 60, height: 60 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
  'mon-adjourn': {
    altDescription: 'The same courtroom stands empty after adjournment, with the bench, witness box and counsel tables orderly and no evidence legible.',
    focalPoint: { x: 50, y: 42 },
    subjectSafeRegion: { x: 10, y: 12, width: 80, height: 66 },
    evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    permittedCaptionPositions: ['bottom'],
  },
}

export function buildSceneArtManifestDraft(courtWeek: CourtWeek): SceneArtManifestDraft {
  const scenes = Object.fromEntries(courtWeek.manifest.sessions.flatMap((session) =>
    session.scenes.map((scene) => {
      const authored = SCENE_ART_AUTHORING[scene.id] ?? {}
      const sources = Object.fromEntries(COMPOSITIONS.map((composition) => [
        composition,
        Object.fromEntries(FORMATS.map((format) => [
          format,
          `scenes/${scene.id}/${composition}.${format}`,
        ])),
      ])) as ReleaseReadySceneArt['sources']
      return [scene.id, {
        altDescription: authored.altDescription ?? scene.visual.alt,
        focalPoint: authored.focalPoint ?? scene.visual.focalPoint,
        subjectSafeRegion: authored.subjectSafeRegion ?? null,
        evidenceSafeRegion: authored.evidenceSafeRegion ?? null,
        permittedCaptionPositions: authored.permittedCaptionPositions ?? [scene.visual.captionPosition],
        currentFallbackId: scene.visual.fallbackId,
        sources,
      }]
    })),
  )
  return {
    schema: SCENE_ART_SCHEMA,
    caseId: 'cw-0001',
    sourceRevision: courtWeek.manifest.revision,
    compositionContract: {
      portrait: { aspectRatio: '9:16', minimumPixels: { width: 720, height: 1280 } },
      tablet: { aspectRatio: '4:3', minimumPixels: { width: 1024, height: 768 } },
      desktop: { aspectRatio: '16:9', minimumPixels: { width: 1280, height: 720 } },
    },
    scenes,
  }
}

export function writeSceneArtManifestDraft(outputPath: string): SceneArtManifestDraft {
  const output = resolve(outputPath)
  const manifest = buildSceneArtManifestDraft(elevenMinutesCourtWeek)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const output = argument('--output')
  if (!output) throw new Error('Usage: tsx scripts/scene-art-requirements.ts --output <manifest.json>')
  const manifest = writeSceneArtManifestDraft(output)
  console.log(`Wrote strict art requirements for ${Object.keys(manifest.scenes).length} Court Week scenes.`)
}
