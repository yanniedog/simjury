import { z } from 'zod'
import type { CourtSession, CourtWeek, SceneCue } from '../model/schema'

const assetName = z.string().regex(/^[0-9a-f]{64}\.(?:opus|m4a|mp3|vtt)$/u)

const runtimeCueSchema = z.object({
  cue_id: z.string().min(1),
  start_seconds: z.number().min(0),
  end_seconds: z.number().positive(),
}).strict().refine((cue) => cue.end_seconds > cue.start_seconds, 'cue range must increase')

const runtimeSegmentSchema = z.object({
  id: z.string().min(1),
  source_scene_id: z.string().min(1),
  duration_seconds: z.number().positive(),
  cues: z.array(runtimeCueSchema).min(1),
  sources: z.object({
    opus: assetName,
    aac: assetName,
    mp3: assetName,
    captions: assetName,
  }).strict(),
}).strict()

export const courtWeekSessionMediaSchema = z.object({
  session_id: z.string().min(1),
  day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  narration_seconds: z.number().positive(),
  experience_seconds: z.number().min(18 * 60).max(22 * 60),
  segments: z.array(runtimeSegmentSchema).min(8).max(12),
}).strict()

export const courtWeekRuntimeMediaManifestSchema = z.object({
  schema: z.literal('simjury.court-week-runtime-media/v1'),
  case_id: z.literal('cw-0001'),
  release_tag: z.string().regex(/^court-week-cw-0001-\d{4}\.\d{2}\.\d{2}-r[1-9]\d*$/u),
  source_revision: z.string().min(1),
  sessions: z.array(courtWeekSessionMediaSchema).length(7),
}).strict()

export type CourtWeekSessionMedia = z.infer<typeof courtWeekSessionMediaSchema>
export type CourtWeekRuntimeMediaManifest = z.infer<typeof courtWeekRuntimeMediaManifestSchema>

export function assertRuntimeMediaCoverage(
  courtWeek: CourtWeek,
  manifest: CourtWeekRuntimeMediaManifest,
): void {
  if (
    manifest.case_id !== courtWeek.manifest.id ||
    manifest.source_revision !== courtWeek.manifest.revision ||
    manifest.release_tag !== courtWeek.manifest.releaseTag
  ) {
    throw new Error('Pinned Court Week audio manifest targets a different reviewed revision.')
  }
  const authoredCueIds = courtWeek.manifest.sessions.flatMap((session) =>
    session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id)))
  const mappedCueIds = manifest.sessions.flatMap((session) =>
    session.segments.flatMap((segment) => segment.cues.map((cue) => cue.cue_id)))
  if (
    new Set(mappedCueIds).size !== mappedCueIds.length ||
    JSON.stringify([...mappedCueIds].sort()) !== JSON.stringify([...authoredCueIds].sort())
  ) {
    throw new Error(`Pinned audio maps ${new Set(mappedCueIds).size} unique cues; reviewed Court Week requires ${authoredCueIds.length}.`)
  }
  for (const sourceSession of courtWeek.manifest.sessions) {
    const media = manifest.sessions.find((session) => session.session_id === sourceSession.id)
    if (!media || media.day !== sourceSession.day) {
      throw new Error(`Pinned audio is missing ${sourceSession.id}.`)
    }
    for (const segment of media.segments) {
      const scene = sourceSession.scenes.find((candidate) => candidate.id === segment.source_scene_id)
      if (!scene) throw new Error(`Audio segment ${segment.id} names an unknown scene.`)
      const sceneCueIds = new Set(scene.cues.map((cue) => cue.id))
      if (segment.cues.some((cue) => !sceneCueIds.has(cue.cue_id))) {
        throw new Error(`Audio segment ${segment.id} crosses its authored scene boundary.`)
      }
      if (segment.cues.some((cue) => cue.end_seconds > segment.duration_seconds)) {
        throw new Error(`Audio segment ${segment.id} has a cue beyond its duration.`)
      }
    }
  }
}

export function attachSessionAudio(
  session: CourtSession,
  media: CourtWeekSessionMedia | undefined,
  releaseTag: string,
): CourtSession {
  if (!media) return session
  const byCue = new Map(media.segments.flatMap((segment) =>
    segment.cues.map((cue) => [cue.cue_id, { segment, cue }] as const)))
  const releaseRoot = `https://github.com/yanniedog/simjury/releases/download/${encodeURIComponent(releaseTag)}`
  return {
    ...session,
    scenes: session.scenes.map((scene) => ({
      ...scene,
      cues: scene.cues.map((cue): SceneCue => {
        const mapping = byCue.get(cue.id)
        if (!mapping) return cue
        return {
          ...cue,
          audio: {
            opus: `${releaseRoot}/${mapping.segment.sources.opus}`,
            aac: `${releaseRoot}/${mapping.segment.sources.aac}`,
            mp3: `${releaseRoot}/${mapping.segment.sources.mp3}`,
            segmentId: mapping.segment.id,
            startSeconds: mapping.cue.start_seconds,
            endSeconds: mapping.cue.end_seconds,
          },
        }
      }),
    })),
  }
}
