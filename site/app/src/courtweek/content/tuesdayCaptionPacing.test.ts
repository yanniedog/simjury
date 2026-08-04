import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildCourtWeekAudioJobs, splitCueUtterances } from '../../../scripts/court-week-audio-jobs'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import { CAPTION_CUE_CHARACTER_LIMIT } from './captionPacing'
import { estimateSessionSeconds } from '../model/validation'

const tuesday = elevenMinutesCourtWeek.manifest.sessions[1]
const tuesdayCues = tuesday.scenes.flatMap((scene) => scene.cues)
const sourceGroups = tuesdayCues.reduce<Array<{ id: string; text: string; cues: typeof tuesdayCues }>>((groups, cue) => {
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

describe('Tuesday caption pacing', () => {
  it('preserves every authored word, event and legal annotation in source order', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(sourceGroups.map(({ id, text }) => [id, text])))
      .digest('hex')

    expect(digest).toBe('26c08e3cff6c84d2df90441aa8fa61e020fcf71af92764e5a9700a0d709383a7')
    expect(sourceGroups).toHaveLength(20)
    expect(tuesdayCues).toHaveLength(116)
    for (const group of sourceGroups) {
      expect(group.cues[0].id).toBe(group.id)
      const source = group.cues[0]
      for (const [index, cue] of group.cues.entries()) {
        expect(cue.sourceCueId).toBe(group.id)
        expect(cue.event).toBe(source.event)
        expect(cue.tone).toBe(source.tone)
        expect(cue.evidenceIds).toEqual(source.evidenceIds)
        expect(cue.replayable).toBe(source.replayable)
        expect(cue.admissionStatus).toBe(index === 0 ? source.admissionStatus : undefined)
        expect(cue.accessibleProposition).toBe(source.accessibleProposition)
      }
    }
  })

  it('limits caption length without changing Tuesday duration or later sessions', () => {
    expect(Math.max(...tuesdayCues.map((cue) => cue.text.length))).toBeLessThanOrEqual(CAPTION_CUE_CHARACTER_LIMIT)
    expect(Math.min(...tuesdayCues.map((cue) => cue.text.length))).toBeGreaterThanOrEqual(28)
    expect(estimateSessionSeconds(tuesday)).toBe(1_257)
    expect(elevenMinutesCourtWeek.manifest.sessions.slice(2)
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
      .every((cue) => cue.sourceCueId === undefined)).toBe(true)
  })

  it('keeps authored utterances in one audio segment with correct recorded voices and pauses', () => {
    const job = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs[1]
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

    const mixed = tuesdayCues.find((cue) => cue.id === 'tue-recording-play--caption-3')!
    expect(mixed.speaker).toBe('Mara Venn')
    expect(splitCueUtterances(mixed).map((cue) => cue.speaker)).toEqual(['Mara Venn', 'Ilan Saye'])
  })
})
