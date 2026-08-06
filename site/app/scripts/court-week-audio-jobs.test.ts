import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { SCENE_ART_AUTHORING } from '../src/courtweek/content/sceneArt'
import { AUDIO_INDEX_SCHEMA, AUDIO_JOB_SCHEMA, AUDIO_SAMPLE_RATE, buildCourtWeekAudioJobs, COURT_WEEK_VOICES, DIALOGUE_SPEAKER_ALIASES, splitCueUtterances, writeCourtWeekAudioJobs } from './court-week-audio-jobs'
import { RUNTIME_DEPENDENT_CUE_IDS } from '../src/courtweek/media/runtimeCues'
import { writeSceneArtManifestDraft } from './scene-art-requirements'
import { courtWeekReviewDigest } from './court-week-review-signoffs'
import type { SceneCue } from '../src/courtweek/model/schema'
import { courtWeekBootstrap } from '../src/courtweek/sealed/bootstrap'

describe('Court Week prerecorded audio jobs', () => {
  it('covers the exact reviewed source with eight deterministic segments per day', () => {
    const first = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    const second = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)

    expect(second).toEqual(first)
    expect(first.index.schema).toBe(AUDIO_INDEX_SCHEMA)
    expect(first.jobs).toHaveLength(7)
    expect(first.jobs.every((job) => job.schema === AUDIO_JOB_SCHEMA)).toBe(true)
    expect(first.jobs.every((job) => job.sampleRate === AUDIO_SAMPLE_RATE)).toBe(true)
    expect(first.jobs.map((job) => job.segments.length)).toEqual([8, 8, 8, 8, 8, 8, 8])
    expect(first.jobs[0].segments.slice(0, 2).map((segment) => segment.sourceSceneId))
      .toEqual(['mon-arrival', 'mon-arrival'])

    for (const job of first.jobs) {
      const sourceCueIds = elevenMinutesCourtWeek.manifest.sessions
        .find((session) => session.id === job.sessionId)!
        .scenes.flatMap((scene) => scene.cues.map((cue) => cue.id))
        .filter((cueId) => !RUNTIME_DEPENDENT_CUE_IDS.has(cueId))
      const audioCueIds = [...new Set(job.segments.flatMap((segment) =>
        segment.captions.map((caption) => caption.id)))]
      expect(audioCueIds.sort()).toEqual([...sourceCueIds].sort())
      expect(new Set(job.segments.map((segment) => segment.opaqueId)).size)
        .toBe(job.segments.length)
    }
  })

  it('preserves the enforced Saturday causation-reasoning floor in the audio budget', () => {
    const saturday = elevenMinutesCourtWeek.manifest.sessions.find(({ day }) => day === 'Saturday')
    if (!saturday) throw new Error('Saturday session is missing from the reviewed Court Week')
    const causation = saturday.scenes.find(({ id }) => id === 'sat-causation')
    if (!causation) throw new Error('Saturday causation scene is missing from the reviewed Court Week')
    const saturdayJob = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs
      .find(({ sessionId }) => sessionId === saturday.id)
    if (!saturdayJob) throw new Error('Saturday audio job is missing from the reviewed Court Week')

    expect(causation.interaction?.minimumSeconds).toBe(95)
    expect(saturdayJob.fixedExperienceSeconds).toBe(765)
  })

  it('isolates an r3 review-candidate identity from the pinned r2 runtime', () => {
    const candidateTag = 'court-week-cw-0001-2026.08.03-r3'
    const normal = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    const candidate = buildCourtWeekAudioJobs(elevenMinutesCourtWeek, {
      reviewCandidateReleaseTag: candidateTag,
    })
    const pinned = JSON.parse(readFileSync(resolve('media/court-week-media-manifest.pinned.json'), 'utf8'))

    expect(elevenMinutesCourtWeek.manifest.releaseTag).toBe('court-week-cw-0001-2026.08.03-r2')
    expect(courtWeekBootstrap.releaseTag).toBe(elevenMinutesCourtWeek.manifest.releaseTag)
    expect(pinned.release_tag).toBe(elevenMinutesCourtWeek.manifest.releaseTag)
    expect(normal.index.releaseTag).toBe(elevenMinutesCourtWeek.manifest.releaseTag)
    expect(normal.jobs.every((job) => job.releaseTag === elevenMinutesCourtWeek.manifest.releaseTag))
      .toBe(true)
    expect(candidate.index.releaseTag).toBe(candidateTag)
    expect(candidate.jobs.every((job) => job.releaseTag === candidateTag)).toBe(true)

    for (const [index, candidateJob] of candidate.jobs.entries()) {
      const normalJob = normal.jobs[index]
      expect({ ...candidateJob, releaseTag: '', sourceDigest: '' })
        .toEqual({ ...normalJob, releaseTag: '', sourceDigest: '' })
      expect(candidateJob.sourceDigest).not.toBe(normalJob.sourceDigest)
    }
    expect(elevenMinutesCourtWeek.manifest.releaseTag).toBe('court-week-cw-0001-2026.08.03-r2')
  })

  it('rejects malformed review-candidate release tags', () => {
    expect(() => buildCourtWeekAudioJobs(elevenMinutesCourtWeek, {
      reviewCandidateReleaseTag: 'court-week-cw-0001-latest',
    })).toThrow('Review candidate must use court-week-cw-0001-YYYY.MM.DD-rN')
  })

  it('synthesizes complete Monday and Tuesday speaker turns while reconstructing every display caption verbatim', () => {
    const { jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    for (const session of elevenMinutesCourtWeek.manifest.sessions.slice(0, 2)) {
      const job = jobs.find((candidate) => candidate.sessionId === session.id)!
      const sourceGroups = session.scenes.flatMap((scene) => scene.cues)
        .reduce<SceneCue[][]>((groups, cue) => {
          const sourceCueId = cue.sourceCueId ?? cue.id
          const current = groups.at(-1)
          if (current && (current[0].sourceCueId ?? current[0].id) === sourceCueId) current.push(cue)
          else groups.push([cue])
          return groups
        }, [])

      expect(job.segments.flatMap((segment) => segment.utterances).length)
        .toBeLessThan(job.segments.flatMap((segment) => segment.captions).length)
      for (const group of sourceGroups) {
        const sourceCueId = group[0].sourceCueId ?? group[0].id
        const segmentIndexes = job.segments.flatMap((segment, index) =>
          segment.captions.some((caption) => caption.sourceCueId === sourceCueId) ? [index] : [])
        expect(segmentIndexes, sourceCueId).toHaveLength(1)
        const segment = job.segments[segmentIndexes[0]]
        const captions = segment.captions.filter((caption) => caption.sourceCueId === sourceCueId)
        const utterances = segment.utterances.filter((utterance) => utterance.sourceCueId === sourceCueId)
        const sourceText = group.map((cue) => cue.text).join(' ')
        expect(captions.map((caption) => caption.text).join(' '), sourceCueId).toBe(sourceText)

        const expectedTurns = splitCueUtterances({
          ...group[0],
          id: sourceCueId,
          sourceCueId: undefined,
          text: sourceText,
        }).reduce<Array<{ speaker: string; text: string }>>((turns, turn) => {
          const current = turns.at(-1)
          if (current?.speaker === turn.speaker) current.text += ` ${turn.text}`
          else turns.push({ speaker: turn.speaker, text: turn.text })
          return turns
        }, [])
        expect(utterances.map(({ speaker, text }) => ({ speaker, text })), sourceCueId).toEqual(expectedTurns)
        for (const utterance of utterances) {
          expect(utterance.parts.map((part) => part.text).join(' '), utterance.id).toBe(utterance.text)
        }
        expect(captions.flatMap((caption) => caption.turns.map((turn) => turn.id)))
          .toEqual(utterances.flatMap((utterance) => utterance.parts.map((part) => part.turnId)))
      }
    }
  })

  it('has an intentional casting decision for every and only authored speaker', () => {
    const speakers = new Set([
      ...elevenMinutesCourtWeek.manifest.sessions.flatMap((session) =>
        session.scenes.flatMap((scene) => scene.cues.map((cue) => cue.speaker))),
      ...Object.values(DIALOGUE_SPEAKER_ALIASES),
    ])
    expect(Object.keys(COURT_WEEK_VOICES).sort()).toEqual([...speakers].sort())
  })

  it('splits multi-party cues into speaker-attributed utterances', () => {
    const orrCross = elevenMinutesCourtWeek.manifest.sessions[0].scenes
      .flatMap((scene) => scene.cues)
      .filter((cue) => (cue.sourceCueId ?? cue.id) === 'mon-orr-cross-1')
    const utterances = orrCross.flatMap(splitCueUtterances)
    expect(utterances.length).toBeGreaterThan(1)
    expect(new Set(utterances.map((utterance) => utterance.sourceCueId)))
      .toEqual(new Set(orrCross.map((cue) => cue.id)))
    expect(new Set(utterances.map((utterance) => utterance.speaker))).toEqual(new Set([
      'Defence counsel Corin Dax',
      'Nella Orr',
    ]))

    const recording = elevenMinutesCourtWeek.manifest.sessions[1].scenes
      .flatMap((scene) => scene.cues)
      .filter((cue) => (cue.sourceCueId ?? cue.id) === 'tue-recording-play')
    const channel = recording.flatMap(splitCueUtterances)
    const speakerTurns = channel.map((utterance) => utterance.speaker)
      .filter((speaker, index, speakers) => index === 0 || speaker !== speakers[index - 1])
    expect(speakerTurns).toEqual([
      'Ilan Saye',
      'Peli Dorn',
      'Mara Venn',
      'Ilan Saye',
      'Recorded channel',
      'Mara Venn',
      'Ilan Saye',
      'Recorded channel',
    ])
    expect(channel.filter(({ speaker }) => speaker === 'Ilan Saye').map(({ text }) => text).join(' '))
      .not.toMatch(/seconds of static|transmission breaks/iu)

    const struckAnswer = elevenMinutesCourtWeek.manifest.sessions[2].scenes
      .flatMap((scene) => scene.cues)
      .find((cue) => cue.id === 'wed-blurt')!
    expect(splitCueUtterances(struckAnswer).map(({ speaker }) => speaker)).toEqual([
      'Defence counsel Corin Dax',
      'Oren Vale',
      'Defence counsel Corin Dax',
    ])

    const crownObjection = elevenMinutesCourtWeek.manifest.sessions[3].scenes
      .flatMap((scene) => scene.cues)
      .find((cue) => cue.id === 'thu-crown-objection')!
    expect(splitCueUtterances(crownObjection).map(({ speaker }) => speaker)).toEqual([
      'Defence counsel Corin Dax',
      'Crown counsel Asha Renn',
      'Judge Sel Aven',
    ])
  })

  it('casts every records and defence-witness exchange to the person speaking', () => {
    const { jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    const expectedTurns = new Map<string, string[]>([
      ['tue-mir-cross-1', [
        'Defence counsel Corin Dax', 'Tovan Mir',
        'Defence counsel Corin Dax', 'Tovan Mir',
        'Defence counsel Corin Dax', 'Tovan Mir',
        'Defence counsel Corin Dax', 'Tovan Mir',
      ]],
      ['thu-rusk-cross-1', [
        'Crown counsel Asha Renn', 'Tali Rusk',
        'Crown counsel Asha Renn', 'Tali Rusk',
        'Crown counsel Asha Renn', 'Tali Rusk',
      ]],
      ['thu-rusk-re-1', ['Defence counsel Corin Dax', 'Tali Rusk']],
      ['thu-quill-cross-1', [
        'Crown counsel Asha Renn', 'Sera Quill',
        'Crown counsel Asha Renn', 'Sera Quill',
        'Crown counsel Asha Renn', 'Sera Quill',
        'Crown counsel Asha Renn', 'Sera Quill',
      ]],
      ['thu-quill-re-1', [
        'Defence counsel Corin Dax', 'Sera Quill',
        'Defence counsel Corin Dax', 'Sera Quill',
      ]],
    ])

    for (const [sourceCueId, expected] of expectedTurns) {
      const utterances = jobs.flatMap((job) => job.segments)
        .flatMap((segment) => segment.utterances)
        .filter((utterance) => utterance.sourceCueId === sourceCueId)
      const speakerTurns = utterances.map(({ speaker }) => speaker)
        .filter((speaker, index, speakers) => index === 0 || speaker !== speakers[index - 1])

      expect(speakerTurns, sourceCueId).toEqual(expected)
      expect(utterances.map(({ text }) => text).join(' '), sourceCueId)
        .not.toMatch(/\b(?:Mir|Rusk|Quill):/u)
    }
  })

  it('reuses voices only for alternate labels of the same in-world speaker', () => {
    const speakersByVoice = Object.entries(COURT_WEEK_VOICES).reduce<Map<string, string[]>>(
      (speakers, [speaker, voice]) => speakers.set(voice, [...(speakers.get(voice) ?? []), speaker]),
      new Map(),
    )
    const sharedVoices = [...speakersByVoice.values()]
      .filter((speakers) => speakers.length > 1)
      .map((speakers) => speakers.sort())
      .sort(([left], [right]) => left.localeCompare(right))

    expect(sharedVoices).toEqual([
      ['Edda Rook', 'Foreperson Edda Rook'],
      ['Judge Sel Aven', 'Judge’s neutral case note'],
    ])
    expect(COURT_WEEK_VOICES['Niko Hale']).not.toBe(COURT_WEEK_VOICES['Tovan Mir'])
  })

  it('omits runtime-dependent Sunday cues from prerecorded jobs', () => {
    const sunday = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs
      .find((job) => job.sessionId === 'cw-0001-sunday')!
    const ids = sunday.segments.flatMap((segment) => segment.captions.map((caption) => caption.id))
    expect(ids).not.toContain('sun-verdict-return')
    expect(ids).not.toContain('sun-analysis')
    expect(ids).toContain('sun-verdict-confirm')
    expect(ids).toContain('sun-analysis-close')
  })

  it('packages complete codec sets into opaque assets and a cue-range runtime manifest', () => {
    const temporary = mkdtempSync(resolve(tmpdir(), 'simjury-court-week-media-'))
    const audioRoot = resolve(temporary, 'audio')
    const outputRoot = resolve(temporary, 'release')
    const jobsRoot = resolve(temporary, 'jobs-root')
    const reviewSignoffs = resolve(temporary, 'review-signoffs.json')
    const artRequirements = resolve(temporary, 'scene-art-requirements.json')
    const artRoot = resolve(temporary, 'art-strips')
    const artStrips = resolve(artRoot, 'scene-art-strips.json')
    const privateOutputRoot = resolve(temporary, 'release-private')
    const releaseTag = elevenMinutesCourtWeek.manifest.releaseTag
    const { jobs } = buildCourtWeekAudioJobs(elevenMinutesCourtWeek)
    try {
      writeCourtWeekAudioJobs(jobsRoot)
      writeFileSync(reviewSignoffs, JSON.stringify({
        schema: 'simjury.court-week-review-report/v1',
        caseId: 'cw-0001',
        revision: elevenMinutesCourtWeek.manifest.revision,
        contentDigest: courtWeekReviewDigest(),
        pendingRoles: ['prosecution'],
        exactSourceMatch: true,
        readyToPublish: false,
      }))
      writeSceneArtManifestDraft(artRequirements)
      const artRequirementsManifest = JSON.parse(readFileSync(artRequirements, 'utf8'))
      mkdirSync(artRoot, { recursive: true })
      const commissionedSessions = elevenMinutesCourtWeek.manifest.sessions.filter((session) =>
        session.scenes.every((scene) => Object.prototype.hasOwnProperty.call(SCENE_ART_AUTHORING, scene.id)),
      )
      const compositions = {
        portrait: { tile: { width: 720, height: 1280 }, strip: { width: 1440, height: 1280 } },
        tablet: { tile: { width: 1024, height: 768 }, strip: { width: 2048, height: 768 } },
        desktop: { tile: { width: 1280, height: 720 }, strip: { width: 2560, height: 720 } },
      }
      const strips = commissionedSessions.flatMap((session) => Array.from({ length: 4 }, (_, stripIndex) => {
        const sources = Object.fromEntries(Object.keys(compositions).map((composition) => [
          composition,
          Object.fromEntries(['avif', 'webp'].map((format) => {
            const path = `strips/day-${String(session.ordinal).padStart(2, '0')}/strip-${stripIndex + 1}/${composition}.${format}`
            const target = resolve(artRoot, path)
            mkdirSync(resolve(target, '..'), { recursive: true })
            writeFileSync(target, `${stripIndex}:${composition}:${format}`)
            return [format, path]
          })),
        ]))
        return {
          sessionId: session.id,
          ordinal: session.ordinal,
          stripIndex,
          sceneSlots: session.scenes.slice(stripIndex * 2, stripIndex * 2 + 2)
            .map((scene, cell) => ({
              sceneId: scene.id,
              cell,
              compositionArt: artRequirementsManifest.scenes[scene.id].compositionArt,
            })),
          sources,
        }
      }))
      writeFileSync(artStrips, JSON.stringify({
        schema: 'simjury.scene-art-strip-source/v1',
        caseId: 'cw-0001',
        sourceRevision: elevenMinutesCourtWeek.manifest.revision,
        grid: { columns: 2, rows: 1 },
        toolchain: { sharp: 'test', vips: 'test' },
        compositions,
        strips,
      }))
      const packageArguments = [
        '--release-tag', releaseTag,
        '--audio-root', audioRoot,
        '--jobs-root', jobsRoot,
        '--review-signoffs', reviewSignoffs,
        '--art-requirements', artRequirements,
        '--art-root', artRoot,
        '--art-strips', artStrips,
        '--private-output-root', privateOutputRoot,
        '--output-root', outputRoot,
      ]
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
            cues: segment.captions.map((caption, index) => {
              const startSeconds = index * segmentSeconds / segment.captions.length
              const endSeconds = (index + 1) * segmentSeconds / segment.captions.length
              return {
                cueId: caption.id,
                sourceCueId: caption.sourceCueId,
                speaker: caption.speaker,
                text: caption.text,
                startSeconds,
                endSeconds,
                turns: caption.turns.map((turn, turnIndex) => ({
                  turnId: turn.id,
                  startSeconds: startSeconds + turnIndex * (endSeconds - startSeconds) / caption.turns.length,
                  endSeconds: startSeconds + (turnIndex + 1) * (endSeconds - startSeconds) / caption.turns.length,
                })),
              }
            }),
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
        ...packageArguments,
      ], { cwd: resolve('.'), stdio: 'pipe' })
      // Structural 55/55 readiness names this `.json`; crop review and signoffs remain separate publication gates.
      const runtime = JSON.parse(readFileSync(resolve(privateOutputRoot, 'court-week-media-manifest.json'), 'utf8'))
      expect(runtime.sessions).toHaveLength(7)
      expect(runtime.sessions.map((session: { day: string }) => session.day)).toEqual([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      ])
      expect(runtime.sessions.every((session: { segments: unknown[] }) => session.segments.length === 8)).toBe(true)
      expect(runtime.sessions[0].segments[0].sources.mp3).toMatch(/^[0-9a-f]{64}\.mp3$/)
      expect(JSON.stringify(runtime)).not.toContain('text')
      expect(JSON.stringify(runtime)).not.toContain('speaker')
      expect(runtime.sessions.find((session: { session_id: string }) =>
        session.session_id === 'cw-0001-monday').art.strips).toHaveLength(4)
      expect(runtime.sessions.find((session: { session_id: string }) =>
        session.session_id === 'cw-0001-tuesday').art.strips).toHaveLength(4)
      expect(runtime.sessions.find((session: { session_id: string }) =>
        session.session_id === 'cw-0001-wednesday').art.strips).toHaveLength(4)
      expect(runtime.sessions.find((session: { session_id: string }) =>
        session.session_id === 'cw-0001-sunday').art.strips).toHaveLength(4)
      const reviewStrips = JSON.parse(readFileSync(resolve(privateOutputRoot, 'scene-art-strips.source.json'), 'utf8'))
      expect(reviewStrips.strips[0].sceneSlots[0]).toMatchObject({
        sceneId: 'mon-arrival',
        compositionArt: {
          portrait: { reviewStatus: 'crop-reviewed' },
          tablet: { reviewStatus: 'crop-reviewed' },
          desktop: { reviewStatus: 'crop-reviewed' },
        },
      })
      const publicManifest = JSON.parse(readFileSync(resolve(outputRoot, 'release-manifest.json'), 'utf8'))
      expect(JSON.stringify(publicManifest)).not.toContain('logical_path')
      expect(JSON.stringify(publicManifest)).not.toContain('mon-arrival')
      expect(publicManifest.court_week_revision).toBe(elevenMinutesCourtWeek.manifest.revision)
      expect(publicManifest.review_content_digest).toBe(courtWeekReviewDigest())
      expect(publicManifest.runtime_manifest_digest).toMatch(/^sha256:[0-9a-f]{64}$/)
      const reviewReport = JSON.parse(readFileSync(resolve(privateOutputRoot, 'review-signoffs.json'), 'utf8'))
      expect(reviewReport.readyToPublish).toBe(false)
      expect(publicManifest.media_bytes).toBeGreaterThan(0)
      expect(publicManifest.total_bytes).toBeGreaterThan(publicManifest.media_bytes)
      expect(publicManifest.total_bytes).toBe(
        publicManifest.media_bytes + Buffer.byteLength(`${JSON.stringify(publicManifest, null, 2)}\n`),
      )
      const artReport = JSON.parse(readFileSync(resolve(privateOutputRoot, 'art-readiness-report.json'), 'utf8'))
      const expectedReadySceneIds = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) =>
        session.scenes.map((scene) => scene.id)
          .filter((sceneId) => Object.prototype.hasOwnProperty.call(SCENE_ART_AUTHORING, sceneId)),
      )
      expect(artReport.release_ready).toBe(true)
      expect(artReport.crop_review_complete).toBe(true)
      expect(artReport.compatibility_migration_scene_ids).toEqual([])
      expect(artReport.ready_scene_count).toBe(expectedReadySceneIds.length)
      expect(artReport.ready_scene_ids).toEqual(expectedReadySceneIds)
      expect(artReport.scene_count).toBe(55)
      expect(artReport.gap_count).toBe(0)
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        ...packageArguments,
        '--require-release-ready-art',
      ], { cwd: resolve('.'), stdio: 'pipe' })).not.toThrow()
      const requiredReport = JSON.parse(readFileSync(resolve(privateOutputRoot, 'art-readiness-report.json'), 'utf8'))
      expect(requiredReport).toMatchObject({ release_ready: true, crop_review_complete: true })

      const mondayManifestPath = resolve(audioRoot, 'cw-0001-monday', 'session-media.json')
      const mondayManifest = JSON.parse(readFileSync(mondayManifestPath, 'utf8'))
      mondayManifest.experienceSeconds = 18 * 60 - 1
      writeFileSync(mondayManifestPath, JSON.stringify(mondayManifest))
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        ...packageArguments,
      ], { cwd: resolve('.'), stdio: 'pipe' })).toThrow()

      mondayManifest.experienceSeconds = 1_200
      mondayManifest.segments[0].cues.pop()
      writeFileSync(mondayManifestPath, JSON.stringify(mondayManifest))
      expect(() => execFileSync(process.execPath, [
        resolve('..', 'scripts', 'prepare-court-week-release.mjs'),
        ...packageArguments,
      ], { cwd: resolve('.'), stdio: 'pipe' })).toThrow()
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  }, 45_000)
})
