import { createHash } from 'node:crypto'
import { elevenMinutesCourtWeek } from '../content'
import { splitCueTurns } from '../content/cueTurns'
import type { CourtSession, SceneCue } from '../model/schema'
import type { CourtWeekRuntimeMediaManifest } from './manifest'
import { isRuntimeDependentCue } from './runtimeCues'

function assetName(seed: string, extension: 'opus' | 'm4a' | 'mp3' | 'vtt' | 'avif' | 'webp') {
  return `${createHash('sha256').update(seed).digest('hex')}.${extension}`
}

export function completeRuntimeMediaFixture(): CourtWeekRuntimeMediaManifest {
  return {
    schema: 'simjury.court-week-runtime-media/v1',
    case_id: 'cw-0001',
    release_tag: elevenMinutesCourtWeek.manifest.releaseTag,
    source_revision: elevenMinutesCourtWeek.manifest.revision,
    sessions: elevenMinutesCourtWeek.manifest.sessions.map((session) => ({
      session_id: session.id,
      day: session.day,
      narration_seconds: 900,
      experience_seconds: 1_200,
      segments: fixtureSegments(session).map((segment) => ({
        id: segment.id,
        source_scene_id: segment.sourceSceneId,
        duration_seconds: segment.cues.length * 6,
        cues: segment.cues
          .filter((cue) => !isRuntimeDependentCue(cue.id))
          .map((cue, index) => {
            const start = index * 6
            const end = start + 5.5
            const turns = splitCueTurns(cue)
            return {
              cue_id: cue.id,
              start_seconds: start,
              end_seconds: end,
              turns: turns.map((turn, turnIndex) => ({
                turn_id: turn.id,
                start_seconds: start + (end - start) * turnIndex / turns.length,
                end_seconds: start + (end - start) * (turnIndex + 1) / turns.length,
              })),
            }
          }),
        sources: {
          opus: assetName(`${session.id}:${segment.id}:opus`, 'opus'),
          aac: assetName(`${session.id}:${segment.id}:aac`, 'm4a'),
          mp3: assetName(`${session.id}:${segment.id}:mp3`, 'mp3'),
          captions: assetName(`${session.id}:${segment.id}:captions`, 'vtt'),
        },
      })),
      art: {
        grid: { columns: 2, rows: 1 },
        compositions: {
          portrait: { tile_width: 720, tile_height: 1280, strip_width: 1440, strip_height: 1280 },
          tablet: { tile_width: 1024, tile_height: 768, strip_width: 2048, strip_height: 768 },
          desktop: { tile_width: 1280, tile_height: 720, strip_width: 2560, strip_height: 720 },
        },
        strips: Array.from({ length: 4 }, (_, stripIndex) => ({
          strip_index: stripIndex + 1,
          scene_slots: session.scenes.slice(stripIndex * 2, stripIndex * 2 + 2).map((scene, cell) => ({
            scene_id: scene.id,
            cell,
          })),
          sources: Object.fromEntries(['portrait', 'tablet', 'desktop'].map((composition) => [
            composition,
            {
              avif: assetName(`${session.id}:strip-${stripIndex + 1}:${composition}:avif`, 'avif'),
              webp: assetName(`${session.id}:strip-${stripIndex + 1}:${composition}:webp`, 'webp'),
            },
          ])) as CourtWeekRuntimeMediaManifest['sessions'][number]['art']['strips'][number]['sources'],
        })),
      },
    })) as CourtWeekRuntimeMediaManifest['sessions'],
  }
}

function fixtureSegments(session: CourtSession): Array<{
  id: string
  sourceSceneId: string
  cues: SceneCue[]
}> {
  const segments = session.scenes.map((scene) => ({
    id: scene.id,
    sourceSceneId: scene.id,
    cues: [...scene.cues],
  }))
  while (segments.length < 8) {
    const index = segments.findIndex((segment) => segment.cues.length > 1)
    if (index < 0) throw new Error(`${session.id} cannot form eight fixture segments`)
    const segment = segments[index]
    const midpoint = Math.ceil(segment.cues.length / 2)
    segments.splice(index, 1,
      { id: `${segment.id}-part-1`, sourceSceneId: segment.sourceSceneId, cues: segment.cues.slice(0, midpoint) },
      { id: `${segment.id}-part-2`, sourceSceneId: segment.sourceSceneId, cues: segment.cues.slice(midpoint) },
    )
  }
  return segments
    .map((segment) => ({
      ...segment,
      cues: segment.cues.filter((cue) => !isRuntimeDependentCue(cue.id)),
    }))
    .filter((segment) => segment.cues.length > 0)
}
