import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { AUDIO_SAMPLE_RATE, buildCourtWeekAudioJobs, COURT_WEEK_VOICES, writeCourtWeekAudioJobs } from './court-week-audio-jobs'
import { writeSceneArtManifestDraft } from './scene-art-requirements'

describe('Court Week prerecorded audio jobs', () => {
  it('covers the exact reviewed source with eight deterministic segments per day', () => {
    const first = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    const second = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)

    expect(second).toEqual(first)
    expect(first.jobs).toHaveLength(7)
    expect(first.jobs.every((job) => job.sampleRate === AUDIO_SAMPLE_RATE)).toBe(true)
    expect(first.jobs.map((job) => job.segments.length)).toEqual([8, 8, 8, 8, 8, 8, 8])
    expect(first.jobs[0].segments.slice(0, 2).map((segment) => segment.sourceSceneId))
      .toEqual(['mon-arrival', 'mon-arrival'])

    for (const job of first.jobs) {
      const sourceCueIds = elevenMinutesCourtWeek.manifest.sessions
        .find((session) => session.id === job.sessionId)!
        .scenes.flatMap((scene) => scene.cues.map((cue) => cue.id))
      const audioCueIds = job.segments.flatMap((segment) => segment.cues.map((cue) => cue.id))
      expect(audioCueIds).toEqual(sourceCueIds)
      expect(new Set(job.segments.map((segment) => segment.opaqueId)).size)
        .toBe(job.segments.length)
    }
  })

  it('has an intentional casting decision for every and only authored speaker', () => {
    const speakers = new Set(elevenMinutesCourtWeek.manifest.sessions.flatMap((session) =>
      session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.speaker))))
    expect(Object.keys(COURT_WEEK_VOICES).sort()).toEqual([...speakers].sort())
  })

  it('packages complete codec sets into opaque assets and a cue-range runtime manifest', () => {
    const temporary = mkdtempSync(resolve(tmpdir(), 'simjury-court-week-media-'))
    const audioRoot = resolve(temporary, 'audio')
    const outputRoot = resolve(temporary, 'release')
    const jobsRoot = resolve(temporary, 'jobs-root')
    const artRequirements = resolve(temporary, 'scene-art-requirements.json')
    const releaseTag = elevenMinutesCourtWeek.manifest.releaseTag
    const { jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    try {
      writeCourtWeekAudioJobs(jobsRoot)
      writeSceneArtManifestDraft(artRequirements)
      for (const job of jobs) {
        const sessionRoot = resolve(audioRoot, job.sessionId)
        mkdirSync(sessionRoot, { recursive: true })
        const narrationSeconds = 1_200 - job.fixedExperienceSeconds
        const segmentSeconds = narrationSeconds / job.segments.length
        const segments = job.segments.map((segment) => {
          const sources: Record<string, string> = {}
          for (const [codec, extension] of Object.entries({ opus: 'opus', aac: 'm4a', mp3: 'mp3', captions: 'vtt' })) {
            const relativePath = `${job.sessionId}/${segment.opaqueId}.${extension}`
            writeFileSync(resolve(audioRoot, relativePath), `${job.sessionId}:${segment.opaqueId}:${codec}`)
            sources[codec] = relativePath
          }
          return {
            id: segment.id,
            opaqueId: segment.opaqueId,
            sourceSceneId: segment.sourceSceneId,
            durationSeconds: segmentSeconds,
            cues: segment.cues.map((cue, index) => ({
              cueId: cue.id,
              speaker: cue.speaker,
              text: cue.text,
              startSeconds: index * segmentSeconds / segment.cues.length,
              endSeconds: (index + 1) * segmentSeconds / segment.cues.length,
            })),
            sources,
            loudness: Object.fromEntries(['opus', 'aac', 'mp3'].map((codec) => [codec, {
              integratedLufs: -18,
              truePeakDbtp: -1.5,
              loudnessRangeLu: 4,
            }])),
          }
        })
        writeFileSync(resolve(sessionRoot, 'session-media.json'), `${JSON.stringify({
          schema: 'simjury.court-week-session-media/v1',
          caseId: 'cw-0001',
          sourceRevision: elevenMinutesCourtWeek.manifest.revision,
          releaseTag,
          sourceDigest: job.sourceDigest,
          sessionId: job.sessionId,
          day: job.day,
          fixedExperienceSeconds: job.fixedExperienceSeconds,
          narrationSeconds,
          experienceSeconds: 1_200,
          productionEnvironment: {
            kokoro: 'test', numpy: 'test', soundfile: 'test', torch: 'test',
            ffmpeg: 'test', python: 'test',
          },
          segments,
        })}\n`)
      }

      execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        '--release-tag', releaseTag,
        '--audio-root', audioRoot,
        '--jobs-root', jobsRoot,
        '--art-requirements', artRequirements,
        '--output-root', outputRoot,
      ], { cwd: resolve('.'), stdio: 'pipe' })
      const runtime = JSON.parse(readFileSync(resolve(outputRoot, 'court-week-media-manifest.json'), 'utf8'))
      expect(runtime.sessions).toHaveLength(7)
      expect(runtime.sessions.every((session: { segments: unknown[] }) => session.segments.length === 8)).toBe(true)
      expect(runtime.sessions[0].segments[0].sources.mp3).toMatch(/^[0-9a-f]{64}\.mp3$/)
      expect(JSON.stringify(runtime)).not.toContain('text')
      expect(JSON.stringify(runtime)).not.toContain('speaker')
      const artReport = JSON.parse(readFileSync(resolve(outputRoot, 'art-readiness-report.json'), 'utf8'))
      expect(artReport.release_ready).toBe(false)
      expect(artReport.ready_scene_count).toBe(7)
      expect(artReport.ready_scene_ids).toEqual([
        'mon-arrival',
        'mon-oath',
        'mon-crown-opening',
        'mon-orr-chief',
        'mon-orr-cross',
        'mon-elements',
        'mon-adjourn',
      ])
      expect(artReport.scene_count).toBe(55)
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        '--release-tag', releaseTag,
        '--audio-root', audioRoot,
        '--jobs-root', jobsRoot,
        '--art-requirements', artRequirements,
        '--output-root', outputRoot,
        '--require-release-ready-art',
      ], { cwd: resolve('.'), stdio: 'pipe' })).toThrow()
      const blockedReport = JSON.parse(readFileSync(resolve(outputRoot, 'art-readiness-report.json'), 'utf8'))
      expect(blockedReport.release_ready).toBe(false)

      const mondayManifestPath = resolve(audioRoot, 'cw-0001-monday', 'session-media.json')
      const mondayManifest = JSON.parse(readFileSync(mondayManifestPath, 'utf8'))
      mondayManifest.experienceSeconds = 18 * 60 - 1
      writeFileSync(mondayManifestPath, JSON.stringify(mondayManifest))
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        '--release-tag', releaseTag,
        '--audio-root', audioRoot,
        '--jobs-root', jobsRoot,
        '--art-requirements', artRequirements,
        '--output-root', outputRoot,
      ], { cwd: resolve('.'), stdio: 'pipe' })).toThrow()

      mondayManifest.experienceSeconds = 1_200
      mondayManifest.segments[0].cues.pop()
      writeFileSync(mondayManifestPath, JSON.stringify(mondayManifest))
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        '--release-tag', releaseTag,
        '--audio-root', audioRoot,
        '--jobs-root', jobsRoot,
        '--art-requirements', artRequirements,
        '--output-root', outputRoot,
      ], { cwd: resolve('.'), stdio: 'pipe' })).toThrow()
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  }, 15_000)
})
