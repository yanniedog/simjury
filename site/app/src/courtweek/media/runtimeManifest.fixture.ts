import { createHash } from 'node:crypto'
import { elevenMinutesCourtWeek } from '../content'
import type { CourtSession, SceneCue } from '../model/schema'
import type { CourtWeekRuntimeMediaManifest } from './manifest'

function assetName(seed: string, extension: 'opus' | 'm4a' | 'mp3' | 'vtt') {
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
        cues: segment.cues.map((cue, index) => ({
          cue_id: cue.id,
          start_seconds: index * 6,
          end_seconds: index * 6 + 5.5,
        })),
        sources: {
          opus: assetName(`${session.id}:${segment.id}:opus`, 'opus'),
          aac: assetName(`${session.id}:${segment.id}:aac`, 'm4a'),
          mp3: assetName(`${session.id}:${segment.id}:mp3`, 'mp3'),
          captions: assetName(`${session.id}:${segment.id}:captions`, 'vtt'),
        },
      })),
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
}
