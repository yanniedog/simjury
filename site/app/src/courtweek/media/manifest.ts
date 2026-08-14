import { z } from 'zod'
import type { CourtSession, CourtWeek, Scene, SceneCue } from '../model/schema'
import { prerecordedCueIds } from './runtimeCues'

const audioAssetName = z.string().regex(/^[0-9a-f]{64}\.(?:opus|m4a|mp3|vtt)$/u)
const artAssetName = z.string().regex(/^[0-9a-f]{64}\.(?:avif|webp)$/u)

const runtimeCueSchema = z.object({
  cue_id: z.string().min(1),
  start_seconds: z.number().min(0),
  end_seconds: z.number().positive(),
  turns: z.array(z.object({
    turn_id: z.string().min(1),
    start_seconds: z.number().min(0),
    end_seconds: z.number().positive(),
  }).strict().refine(
    (turn) => turn.end_seconds > turn.start_seconds,
    'turn range must increase',
  )).min(1),
}).strict().refine((cue) => cue.end_seconds > cue.start_seconds, 'cue range must increase')

const runtimeSegmentSchema = z.object({
  id: z.string().min(1),
  source_scene_id: z.string().min(1),
  duration_seconds: z.number().positive(),
  cues: z.array(runtimeCueSchema).min(1),
  sources: z.object({
    opus: audioAssetName,
    aac: audioAssetName,
    mp3: audioAssetName,
    captions: audioAssetName,
  }).strict(),
}).strict()

const stripSourcesSchema = z.object({
  avif: artAssetName,
  webp: artAssetName,
}).strict()

const runtimeArtSchema = z.object({
  grid: z.object({ columns: z.literal(2), rows: z.literal(1) }).strict(),
  compositions: z.object({
    portrait: z.object({
      tile_width: z.literal(720), tile_height: z.literal(1280),
      strip_width: z.literal(1440), strip_height: z.literal(1280),
    }).strict(),
    tablet: z.object({
      tile_width: z.literal(1024), tile_height: z.literal(768),
      strip_width: z.literal(2048), strip_height: z.literal(768),
    }).strict(),
    desktop: z.object({
      tile_width: z.literal(1280), tile_height: z.literal(720),
      strip_width: z.literal(2560), strip_height: z.literal(720),
    }).strict(),
  }).strict(),
  strips: z.array(z.object({
    strip_index: z.number().int().min(1).max(4),
    scene_slots: z.array(z.object({
      scene_id: z.string().min(1),
      cell: z.union([z.literal(0), z.literal(1)]),
    }).strict()).min(1).max(2),
    sources: z.object({
      portrait: stripSourcesSchema,
      tablet: stripSourcesSchema,
      desktop: stripSourcesSchema,
    }).strict(),
  }).strict()).length(4),
}).strict()

export const courtWeekSessionMediaSchema = z.object({
  session_id: z.string().min(1),
  day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  narration_seconds: z.number().positive(),
  experience_seconds: z.number().positive(),
  segments: z.array(runtimeSegmentSchema).min(8).max(12),
  art: runtimeArtSchema,
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
    throw new Error('Pinned Court Week media manifest targets a different reviewed revision.')
  }
  const authoredCueIds = prerecordedCueIds(courtWeek.manifest.sessions.flatMap((session) =>
    session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.id))))
  const mappedCueIds = manifest.sessions.flatMap((session) =>
    session.segments.flatMap((segment) => segment.cues.map((cue) => cue.cue_id)))
  if (
    new Set(mappedCueIds).size !== mappedCueIds.length ||
    JSON.stringify([...mappedCueIds].sort()) !== JSON.stringify([...authoredCueIds].sort())
  ) {
    throw new Error(`Pinned media maps ${new Set(mappedCueIds).size} unique cues; reviewed Court Week requires ${authoredCueIds.length} prerecorded cues.`)
  }
  for (const sourceSession of courtWeek.manifest.sessions) {
    const media = manifest.sessions.find((session) => session.session_id === sourceSession.id)
    if (!media || media.day !== sourceSession.day) {
      throw new Error(`Pinned media is missing ${sourceSession.id}.`)
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
      for (const cue of segment.cues) {
        const turnIds = cue.turns.map((turn) => turn.turn_id)
        if (
          new Set(turnIds).size !== turnIds.length ||
          cue.turns.some((turn) =>
            turn.start_seconds < cue.start_seconds || turn.end_seconds > cue.end_seconds)
          || cue.turns.some((turn, index, turns) =>
            index > 0 && turn.start_seconds < turns[index - 1].end_seconds)
          || cue.turns[0].start_seconds !== cue.start_seconds
          || cue.turns.at(-1)!.end_seconds !== cue.end_seconds
        ) {
          throw new Error(`Audio cue ${cue.cue_id} has invalid spoken-turn timing.`)
        }
      }
    }
    const expectedSceneIds = sourceSession.scenes.map((scene) => scene.id)
    const strips = [...media.art.strips].sort((left, right) => left.strip_index - right.strip_index)
    if (strips.some((strip, index) => strip.strip_index !== index + 1)) {
      throw new Error(`Pinned art for ${sourceSession.id} does not have four ordered strips.`)
    }
    const mappedSceneIds = strips.flatMap((strip) => {
      if (strip.scene_slots.some((slot, index) => slot.cell !== index)) {
        throw new Error(`Pinned art strip ${strip.strip_index} has a non-chronological cell map.`)
      }
      return strip.scene_slots.map((slot) => slot.scene_id)
    })
    if (JSON.stringify(mappedSceneIds) !== JSON.stringify(expectedSceneIds)) {
      throw new Error(`Pinned art for ${sourceSession.id} does not map its exact scene order.`)
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
        const authoredTurnIds = cue.turns?.map((turn) => turn.id)
        const mediaTurnIds = mapping.cue.turns.map((turn) => turn.turn_id)
        if (
          authoredTurnIds &&
          JSON.stringify(authoredTurnIds) !== JSON.stringify(mediaTurnIds)
        ) {
          throw new Error(`Pinned spoken turns do not match reviewed cue ${cue.id}.`)
        }
        return {
          ...cue,
          audio: {
            opus: `${releaseRoot}/${mapping.segment.sources.opus}`,
            aac: `${releaseRoot}/${mapping.segment.sources.aac}`,
            mp3: `${releaseRoot}/${mapping.segment.sources.mp3}`,
            segmentId: mapping.segment.id,
            startSeconds: mapping.cue.start_seconds,
            endSeconds: mapping.cue.end_seconds,
            turns: mapping.cue.turns.map((turn) => ({
              id: turn.turn_id,
              startSeconds: turn.start_seconds,
              endSeconds: turn.end_seconds,
            })),
          },
        }
      }),
    })),
  }
}

export function attachSessionArt(
  session: CourtSession,
  media: CourtWeekSessionMedia | undefined,
  releaseTag: string,
): CourtSession {
  if (!media) return session
  const releaseRoot = `https://github.com/yanniedog/simjury/releases/download/${encodeURIComponent(releaseTag)}`
  const byScene = new Map(media.art.strips.flatMap((strip) =>
    strip.scene_slots.map((slot) => [slot.scene_id, { strip, slot }] as const)))
  return {
    ...session,
    scenes: session.scenes.map((scene) => {
      const mapping = byScene.get(scene.id)
      if (!mapping) return scene
      return {
        ...scene,
        visual: {
          ...scene.visual,
          runtimeStrip: {
            cell: mapping.slot.cell,
            sources: Object.fromEntries(
              Object.entries(mapping.strip.sources).map(([composition, sources]) => [
                composition,
                Object.fromEntries(Object.entries(sources).map(([format, asset]) => [
                  format, `${releaseRoot}/${asset}`,
                ])),
              ]),
            ) as NonNullable<Scene['visual']['runtimeStrip']>['sources'],
          },
        },
      }
    }),
  }
}
