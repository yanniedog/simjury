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
  'subjectSafeRegion' | 'evidenceSafeRegion' | 'permittedCaptionPositions'
>>>> = {}

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
        altDescription: scene.visual.alt,
        focalPoint: scene.visual.focalPoint,
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
