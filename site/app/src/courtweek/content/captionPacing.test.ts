import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildCourtWeekAudioJobs, splitCueUtterances } from '../../../scripts/court-week-audio-jobs'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import { CAPTION_CUE_CHARACTER_LIMIT } from './captionPacing'
import { estimateSessionSeconds } from '../model/validation'

const monday = elevenMinutesCourtWeek.manifest.sessions[0]
const mondayCues = monday.scenes.flatMap((scene) => scene.cues)
const sourceGroups = mondayCues.reduce<Array<{ id: string; text: string; cues: typeof mondayCues }>>((groups, cue) => {
  const sourceId = cue.sourceCueId ?? cue.id
  const current = groups.at(-1)
  if (current?.id === sourceId) {
    current.text += ` ${cue.text}`
    current.cues.push(cue)
  } else {
    groups.push({ id: sourceId, text: cue.text, cues: [cue] })
  }
  return groups
}, [])

describe('Monday caption pacing', () => {
  it('preserves every authored word, event and legal annotation in source order', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(sourceGroups.map(({ id, text }) => [id, text])))
      .digest('hex')

    expect(digest).toBe('10b8e0ac536236a12c1570f50eb30051eb0b21c953438536623e2c6cb7263ea8')
    expect(sourceGroups).toHaveLength(17)
    expect(mondayCues).toHaveLength(78)
    for (const group of sourceGroups) {
      expect(group.cues[0].id).toBe(group.id)
      const source = group.cues[0]
      for (const cue of group.cues) {
        expect(cue.sourceCueId).toBe(group.id)
        expect(cue.event).toBe(source.event)
        expect(cue.tone).toBe(source.tone)
        expect(cue.evidenceIds).toEqual(source.evidenceIds)
        expect(cue.replayable).toBe(source.replayable)
        expect(cue.admissionStatus).toBe(source.admissionStatus)
        expect(cue.accessibleProposition).toBe(source.accessibleProposition)
      }
    }
  })

  it('limits caption length without changing Monday duration or later sessions', () => {
    expect(Math.max(...mondayCues.map((cue) => cue.text.length))).toBeLessThanOrEqual(CAPTION_CUE_CHARACTER_LIMIT)
    expect(Math.min(...mondayCues.map((cue) => cue.text.length))).toBeGreaterThanOrEqual(32)
    expect(estimateSessionSeconds(monday)).toBe(1_272)
    expect(elevenMinutesCourtWeek.manifest.sessions.slice(1)
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
      .every((cue) => cue.sourceCueId === undefined)).toBe(true)
  })

  it('keeps authored utterances inside one audio segment and removes only internal split pauses', () => {
    const job = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs[0]
    expect(job.segments).toHaveLength(8)
    for (const group of sourceGroups) {
      const segmentIndexes = job.segments.flatMap((segment, index) =>
        segment.cues.some((audioCue) => group.cues.some((cue) => cue.id === audioCue.sourceCueId)) ? [index] : [],
      )
      expect(new Set(segmentIndexes).size, group.id).toBe(1)
      const audioCues = job.segments.flatMap((segment) => segment.cues)
        .filter((audioCue) => group.cues.some((cue) => cue.id === audioCue.sourceCueId))
      const captionCueIds = [...new Set(audioCues.map((cue) => cue.sourceCueId))]
      for (const captionCueId of captionCueIds.slice(0, -1)) {
        expect(audioCues.filter((cue) => cue.sourceCueId === captionCueId).at(-1)?.pauseAfterMs).toBe(0)
      }
      expect(audioCues.at(-1)?.pauseAfterMs).toBeGreaterThan(0)
    }

    const continuation = mondayCues.find((cue) => cue.id === 'mon-orr-cross-1--caption-2')!
    const mixedContinuation = mondayCues.find((cue) => cue.id === 'mon-orr-cross-1--caption-3')!
    expect(continuation.speaker).toBe('Nella Orr')
    expect(splitCueUtterances(continuation).map((cue) => cue.speaker)).toEqual(['Nella Orr'])
    expect(splitCueUtterances(mixedContinuation).map((cue) => cue.speaker)).toEqual([
      'Nella Orr', 'Defence counsel Corin Dax',
    ])
  })
})
