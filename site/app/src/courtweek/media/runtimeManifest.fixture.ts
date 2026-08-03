import { createHash } from 'node:crypto'
import { buildCourtWeekAudioJobs } from '../../../scripts/court-week-audio-jobs'
import { elevenMinutesCourtWeek } from '../content'
import type { CourtWeekRuntimeMediaManifest } from './manifest'

function assetName(seed: string, extension: 'opus' | 'm4a' | 'mp3' | 'vtt') {
  return `${createHash('sha256').update(seed).digest('hex')}.${extension}`
}

export function completeRuntimeMediaFixture(): CourtWeekRuntimeMediaManifest {
  const { jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
  return {
    schema: 'simjury.court-week-runtime-media/v1',
    case_id: 'cw-0001',
    release_tag: elevenMinutesCourtWeek.manifest.releaseTag,
    source_revision: elevenMinutesCourtWeek.manifest.revision,
    sessions: jobs.map((job) => ({
      session_id: job.sessionId,
      day: job.day,
      narration_seconds: 900,
      experience_seconds: 1_200,
      segments: job.segments.map((segment) => ({
        id: segment.id,
        source_scene_id: segment.sourceSceneId,
        duration_seconds: segment.cues.length * 6,
        cues: segment.cues.map((cue, index) => ({
          cue_id: cue.id,
          start_seconds: index * 6,
          end_seconds: index * 6 + 5.5,
        })),
        sources: {
          opus: assetName(`${job.sessionId}:${segment.id}:opus`, 'opus'),
          aac: assetName(`${job.sessionId}:${segment.id}:aac`, 'm4a'),
          mp3: assetName(`${job.sessionId}:${segment.id}:mp3`, 'mp3'),
          captions: assetName(`${job.sessionId}:${segment.id}:captions`, 'vtt'),
        },
      })),
    })) as CourtWeekRuntimeMediaManifest['sessions'],
  }
}
