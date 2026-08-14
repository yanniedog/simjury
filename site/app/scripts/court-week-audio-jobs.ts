import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { RUNTIME_DEPENDENT_CUE_IDS } from '../src/courtweek/media/runtimeCues'
import { DIALOGUE_SPEAKER_ALIASES } from '../src/courtweek/content/dialogueSpeakers'
import { splitCueTurns } from '../src/courtweek/content/cueTurns'
import type { CourtSession, CourtWeek, SceneCue } from '../src/courtweek/model/schema'

export const AUDIO_JOB_SCHEMA = 'simjury.court-week-audio-job/v2' as const
export const AUDIO_INDEX_SCHEMA = 'simjury.court-week-audio-index/v2' as const
export const AUDIO_SAMPLE_RATE = 24_000

const COURT_WEEK_RELEASE_TAG = /^court-week-cw-0001-\d{4}\.\d{2}\.\d{2}-r[1-9]\d*$/u

export interface CourtWeekAudioJobOptions {
  /**
   * Review-build identity only. This does not mutate the authored Court Week,
   * bootstrap or pinned runtime manifest.
   */
  reviewCandidateReleaseTag?: string
}

/**
 * Reviewed voice casting. Speaker names are deliberately explicit: adding a
 * speaker to the TrialRecord cannot silently select a random or generic voice.
 */
export const COURT_WEEK_VOICES: Readonly<Record<string, string>> = {
  'Ari Tem': 'am_eric',
  'Bram Tey': 'bm_fable',
  'Clerk': 'bf_emma',
  'Court officer': 'bm_daniel',
  'Crown counsel Asha Renn': 'af_bella',
  'Daro Sen': 'am_echo',
  'Defence counsel Corin Dax': 'bm_lewis',
  'Dr Eren Vos': 'bf_lily',
  'Edda Rook': 'af_river',
  'Foreperson Edda Rook': 'af_river',
  'Ilan Saye': 'am_adam',
  'Jaro Pell': 'am_fenrir',
  'Judge Sel Aven': 'bm_george',
  'Judge’s neutral case note': 'bm_george',
  'Kessa Noor': 'af_aoede',
  'Lina Fei': 'af_kore',
  'Mara Venn': 'af_alloy',
  'Narrator': 'af_heart',
  'Nella Orr': 'af_nicole',
  'Niko Hale': 'am_santa',
  'Omri Cade': 'am_onyx',
  'Oren Vale': 'am_liam',
  'Peli Dorn': 'af_sarah',
  'Recorded channel': 'af_nova',
  'Sera Quill': 'bf_isabella',
  'Sola Iven': 'af_jessica',
  'Tali Rusk': 'bf_alice',
  'Toma Reed': 'am_puck',
  'Tovan Mir': 'am_michael',
  'Yara Merrow': 'af_sky',
}

/**
 * Short dialogue labels embedded in multi-party cue text map to reviewed voices.
 * Cue.speaker remains the legal actor; synthesis uses these for attributed lines.
 */
export { DIALOGUE_SPEAKER_ALIASES }

export interface AudioJobCue {
  id: string
  sourceCueId: string
  speaker: string
  text: string
  voice: string
  tone: SceneCue['tone']
  pauseAfterMs: number
}

export interface AudioJobCaptionTurn {
  id: string
  speaker: string
  text: string
  utteranceId: string
}

export interface AudioJobCaption {
  id: string
  sourceCueId: string
  speaker: string
  text: string
  turns: AudioJobCaptionTurn[]
}

export interface AudioJobUtterancePart {
  captionId: string
  turnId: string
  text: string
}

export interface AudioJobUtterance extends AudioJobCue {
  parts: AudioJobUtterancePart[]
}

export interface AudioJobSegment {
  id: string
  opaqueId: string
  sourceSceneId: string
  captions: AudioJobCaption[]
  utterances: AudioJobUtterance[]
}

export interface CourtWeekAudioJob {
  schema: typeof AUDIO_JOB_SCHEMA
  caseId: 'cw-0001'
  sourceRevision: string
  releaseTag: string
  sessionId: string
  day: CourtSession['day']
  sampleRate: typeof AUDIO_SAMPLE_RATE
  fixedExperienceSeconds: number
  sourceDigest: string
  segments: AudioJobSegment[]
}

export interface CourtWeekAudioIndex {
  schema: typeof AUDIO_INDEX_SCHEMA
  caseId: 'cw-0001'
  sourceRevision: string
  releaseTag: string
  sessionCount: 7
  jobs: Array<{
    sessionId: string
    day: CourtSession['day']
    path: string
    segmentCount: number
    sourceDigest: string
  }>
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function pauseAfterMs(cue: SceneCue): number {
  if (cue.tone === 'ruling') return 520
  if (cue.tone === 'formal') return 420
  if (cue.tone === 'cross') return 300
  return 340
}

function castUtterance(
  cue: SceneCue,
  speaker: string,
  text: string,
  id: string,
): AudioJobCue {
  const voice = COURT_WEEK_VOICES[speaker]
  if (!voice) throw new Error(`No reviewed Kokoro voice for speaker: ${speaker}`)
  const trimmed = text.trim()
  if (!trimmed) throw new Error(`Empty utterance after multi-speaker split for ${cue.id}`)
  return {
    id,
    sourceCueId: cue.id,
    speaker,
    text: trimmed,
    voice,
    tone: cue.tone,
    pauseAfterMs: pauseAfterMs(cue),
  }
}

/**
 * Split cues that embed labelled multi-party dialogue (e.g. "Dax: … Orr: …")
 * into speaker-attributed utterances before voice assignment.
 */
export function splitCueUtterances(cue: SceneCue): AudioJobCue[] {
  return splitCueTurns(cue).map((turn) =>
    castUtterance(cue, turn.speaker, turn.text, turn.id))
}

function groupSourceCues(cues: SceneCue[]): SceneCue[][] {
  return cues.reduce<SceneCue[][]>((groups, cue) => {
    const sourceCueId = cue.sourceCueId ?? cue.id
    const current = groups.at(-1)
    if (current && (current[0].sourceCueId ?? current[0].id) === sourceCueId) current.push(cue)
    else groups.push([cue])
    return groups
  }, [])
}

/**
 * Captions are display-sized projections of an authored cue. Synthesis instead
 * follows complete, adjacent speaker turns so a visual line wrap can never
 * reset prosody in the middle of an utterance.
 */
function buildSourceAudio(cues: SceneCue[]): {
  captions: AudioJobCaption[]
  utterances: AudioJobUtterance[]
} {
  const sourceCueId = cues[0]?.sourceCueId ?? cues[0]?.id
  if (!sourceCueId) throw new Error('Cannot build audio for an empty source-cue group')
  if (cues.some((cue) => (cue.sourceCueId ?? cue.id) !== sourceCueId)) {
    throw new Error(`${sourceCueId}: audio source group contains another authored cue`)
  }
  const tone = cues[0].tone
  if (cues.some((cue) => cue.tone !== tone)) {
    throw new Error(`${sourceCueId}: caption projections disagree on delivery tone`)
  }

  const pendingCaptions = cues.map((cue) => ({ cue, turns: splitCueUtterances(cue) }))
  const utterances: AudioJobUtterance[] = []
  const utteranceByTurn = new Map<string, string>()

  for (const { cue, turns } of pendingCaptions) {
    for (const turn of turns) {
      let utterance = utterances.at(-1)
      if (!utterance || utterance.speaker !== turn.speaker) {
        const id = `${sourceCueId}--utterance-${utterances.length + 1}`
        utterance = {
          ...turn,
          id,
          sourceCueId,
          text: turn.text,
          pauseAfterMs: pauseAfterMs(cue),
          parts: [],
        }
        utterances.push(utterance)
      } else {
        utterance.text += ` ${turn.text}`
        utterance.pauseAfterMs = pauseAfterMs(cue)
      }
      utterance.parts.push({ captionId: cue.id, turnId: turn.id, text: turn.text })
      utteranceByTurn.set(turn.id, utterance.id)
    }
  }

  const captions = pendingCaptions.map(({ cue, turns }): AudioJobCaption => ({
    id: cue.id,
    sourceCueId,
    speaker: cue.speaker,
    text: cue.text,
    turns: turns.map((turn) => ({
      id: turn.id,
      speaker: turn.speaker,
      text: turn.text,
      utteranceId: utteranceByTurn.get(turn.id) ?? '',
    })),
  }))
  if (captions.some((caption) => caption.turns.some((turn) => !turn.utteranceId))) {
    throw new Error(`${sourceCueId}: a display-caption turn has no performance utterance`)
  }
  return { captions, utterances }
}

function splitForMinimum(session: CourtSession): Array<{ id: string; sourceSceneId: string; cues: SceneCue[] }> {
  const segments = session.scenes.map((scene) => ({
    id: scene.id,
    sourceSceneId: scene.id,
    cues: [...scene.cues],
  }))
  if (segments.length > 12) {
    throw new Error(`${session.id} has ${segments.length} authored scenes; editorial grouping is required above 12`)
  }
  while (segments.length < 8) {
    const index = segments.findIndex((segment) => segment.cues.length > 1)
    if (index < 0) throw new Error(`${session.id} cannot reach eight audio segments at cue boundaries`)
    const current = segments[index]
    let midpoint = Math.ceil(current.cues.length / 2)
    while (
      midpoint < current.cues.length &&
      current.cues[midpoint].sourceCueId &&
      current.cues[midpoint].sourceCueId === current.cues[midpoint - 1].sourceCueId
    ) midpoint += 1
    if (midpoint === current.cues.length) {
      midpoint = Math.ceil(current.cues.length / 2)
      while (
        midpoint > 0 &&
        current.cues[midpoint].sourceCueId &&
        current.cues[midpoint].sourceCueId === current.cues[midpoint - 1].sourceCueId
      ) midpoint -= 1
    }
    if (midpoint <= 0 || midpoint >= current.cues.length) {
      throw new Error(`${session.id}: no safe authored cue boundary for audio segmentation`)
    }
    segments.splice(index, 1,
      { id: `${current.id}-part-1`, sourceSceneId: current.sourceSceneId, cues: current.cues.slice(0, midpoint) },
      { id: `${current.id}-part-2`, sourceSceneId: current.sourceSceneId, cues: current.cues.slice(midpoint) },
    )
  }
  return segments
}

export function buildCourtWeekAudioJobs(
  courtWeek: CourtWeek,
  options: CourtWeekAudioJobOptions = {},
): {
  index: CourtWeekAudioIndex
  jobs: CourtWeekAudioJob[]
} {
  const releaseTag = options.reviewCandidateReleaseTag ?? courtWeek.manifest.releaseTag
  if (!COURT_WEEK_RELEASE_TAG.test(releaseTag)) {
    throw new Error('Review candidate must use court-week-cw-0001-YYYY.MM.DD-rN')
  }
  const cueSpeakers = new Set(
    courtWeek.manifest.sessions.flatMap((session) =>
      session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.speaker))),
  )
  const dialogueSpeakers = new Set(Object.values(DIALOGUE_SPEAKER_ALIASES))
  const speakers = new Set([...cueSpeakers, ...dialogueSpeakers])
  const unmapped = [...speakers].filter((speaker) => !COURT_WEEK_VOICES[speaker])
  if (unmapped.length) throw new Error(`Uncast Court Week speakers: ${unmapped.sort().join(', ')}`)
  const unused = Object.keys(COURT_WEEK_VOICES).filter((speaker) => !speakers.has(speaker))
  if (unused.length) throw new Error(`Stale Court Week voice assignments: ${unused.sort().join(', ')}`)

  const jobs = courtWeek.manifest.sessions.map((session): CourtWeekAudioJob => {
    const segments = splitForMinimum(session).map((segment) => {
      const synthesisCues = segment.cues.filter((cue) => !RUNTIME_DEPENDENT_CUE_IDS.has(cue.id))
      const sourceAudio = groupSourceCues(synthesisCues).map(buildSourceAudio)
      const captions = sourceAudio.flatMap((group) => group.captions)
      const utterances = sourceAudio.flatMap((group) => group.utterances)
      return {
        id: segment.id,
        opaqueId: sha256([
          AUDIO_JOB_SCHEMA,
          courtWeek.manifest.id,
          courtWeek.manifest.revision,
          session.id,
          segment.sourceSceneId,
          ...captions.map((caption) => caption.id),
          ...utterances.flatMap((utterance) => [utterance.id, utterance.speaker, utterance.text]),
        ].join('\0')).slice(0, 32),
        sourceSceneId: segment.sourceSceneId,
        captions,
        utterances,
      }
    }).filter((segment) => segment.utterances.length > 0)
    if (segments.length < 8 || segments.length > 12) {
      throw new Error(`${session.id} has ${segments.length} synthesizable audio segments after omitting runtime-dependent cues; need 8-12`)
    }
    // Retained in the v1 job shape for media-tool compatibility. Court Week is
    // self-paced, so no non-audio duration may be added to the experience.
    const fixedExperienceSeconds = 0
    const digestInput = {
      schema: AUDIO_JOB_SCHEMA,
      caseId: courtWeek.manifest.id,
      sourceRevision: courtWeek.manifest.revision,
      releaseTag,
      sessionId: session.id,
      day: session.day,
      sampleRate: 24_000 as const,
      fixedExperienceSeconds,
      segments,
    }
    return {
      ...digestInput,
      sourceDigest: sha256(JSON.stringify(digestInput)),
    }
  })

  const index: CourtWeekAudioIndex = {
    schema: AUDIO_INDEX_SCHEMA,
    caseId: 'cw-0001',
    sourceRevision: courtWeek.manifest.revision,
    releaseTag,
    sessionCount: 7,
    jobs: jobs.map((job) => ({
      sessionId: job.sessionId,
      day: job.day,
      path: `jobs/${job.sessionId}.json`,
      segmentCount: job.segments.length,
      sourceDigest: job.sourceDigest,
    })),
  }
  return { index, jobs }
}

export function writeCourtWeekAudioJobs(
  outputDirectory: string,
  options: CourtWeekAudioJobOptions = {},
): CourtWeekAudioIndex {
  const output = resolve(outputDirectory)
  const { index, jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek, options)
  rmSync(output, { recursive: true, force: true })
  mkdirSync(resolve(output, 'jobs'), { recursive: true })
  for (const job of jobs) {
    writeFileSync(resolve(output, 'jobs', `${job.sessionId}.json`), `${JSON.stringify(job, null, 2)}\n`)
  }
  writeFileSync(resolve(output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  return index
}

function cliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const output = cliArgument('--output')
  const reviewCandidateReleaseTag = cliArgument('--review-candidate-release-tag')
  if (!output) {
    throw new Error(
      'Usage: tsx scripts/court-week-audio-jobs.ts --output <directory> ' +
      '[--review-candidate-release-tag court-week-cw-0001-YYYY.MM.DD-rN]',
    )
  }
  const index = writeCourtWeekAudioJobs(output, { reviewCandidateReleaseTag })
  console.log(`Wrote ${index.jobs.length} deterministic Court Week audio jobs to ${resolve(output)}.`)
}
