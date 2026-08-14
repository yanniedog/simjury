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

    expect(digest).toBe('67f4cc7590d6e70a6a4b5d5efa7573228156ba5e05cc5df5979527906365e7bd')
    expect(sourceGroups).toHaveLength(20)
    expect(tuesdayCues).toHaveLength(118)
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

  it('limits caption length while reporting only Tuesday authored speech', () => {
    expect(Math.max(...tuesdayCues.map((cue) => cue.text.length))).toBeLessThanOrEqual(CAPTION_CUE_CHARACTER_LIMIT)
    expect(Math.min(...tuesdayCues.map((cue) => cue.text.length))).toBeGreaterThanOrEqual(28)
    expect(estimateSessionSeconds(tuesday)).toBeLessThan(8 * 60)
    expect(elevenMinutesCourtWeek.manifest.sessions.slice(2)
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
      .every((cue) => cue.sourceCueId === undefined)).toBe(true)
  })

  it('keeps authored utterances in one audio segment with captions independent from synthesis', () => {
    const job = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs[1]
    expect(job.segments).toHaveLength(8)
    for (const group of sourceGroups) {
      const segmentIndexes = job.segments.flatMap((segment, index) =>
        segment.captions.some((caption) => caption.sourceCueId === group.id) ? [index] : [],
      )
      expect(new Set(segmentIndexes).size, group.id).toBe(1)
      const captions = job.segments.flatMap((segment) => segment.captions)
        .filter((caption) => caption.sourceCueId === group.id)
      const utterances = job.segments.flatMap((segment) => segment.utterances)
        .filter((utterance) => utterance.sourceCueId === group.id)
      expect(captions.map((caption) => caption.id)).toEqual(group.cues.map((cue) => cue.id))
      expect(captions.map((caption) => caption.text).join(' ')).toBe(group.text)
      expect(utterances.every((utterance) => utterance.pauseAfterMs > 0)).toBe(true)
      expect(utterances.flatMap((utterance) => utterance.parts.map((part) => part.turnId)))
        .toEqual(captions.flatMap((caption) => caption.turns.map((turn) => turn.id)))
    }

    const mixed = tuesdayCues.find((cue) => cue.id === 'tue-recording-play--caption-3')!
    expect(mixed.speaker).toBe('Mara Venn')
    expect(splitCueUtterances(mixed).map((cue) => cue.speaker)).toEqual(['Mara Venn', 'Ilan Saye'])
  })
})
