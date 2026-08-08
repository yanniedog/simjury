import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildCourtWeekAudioJobs, splitCueUtterances } from '../../../scripts/court-week-audio-jobs'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import {
  CAPTION_CUE_CHARACTER_LIMIT,
  joinAuthoredCueText,
  nextAuthoredCue,
} from './captionPacing'
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
  it('rejoins caption fragments and advances by authored utterance for reading mode', () => {
    const first = mondayCues[0]
    const joined = joinAuthoredCueText(mondayCues, first)
    expect(joined.startsWith('Members of the jury panel')).toBe(true)
    expect(joined).toContain('one running this simulation')
    expect(joined.length).toBeGreaterThan(CAPTION_CUE_CHARACTER_LIMIT)
    const next = nextAuthoredCue(mondayCues, 0)
    expect(next?.id).toBe('mon-arrival-2')
    expect(nextAuthoredCue(mondayCues, mondayCues.length - 1)).toBeUndefined()
  })

  it('preserves every authored word, event and legal annotation in source order', () => {
    const digest = createHash('sha256')
      .update(JSON.stringify(sourceGroups.map(({ id, text }) => [id, text])))
      .digest('hex')

    expect(digest).toBe('43f64efe7f8ca33357bc2c48625af7f4505173b874d8c2d621618b2431239b84')
    expect(sourceGroups).toHaveLength(18)
    expect(mondayCues).toHaveLength(95)
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
    expect(Math.min(...mondayCues.map((cue) => cue.text.length))).toBeGreaterThanOrEqual(30)
    expect(estimateSessionSeconds(monday)).toBe(1_277)
    expect(elevenMinutesCourtWeek.manifest.sessions.slice(2)
      .flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
      .every((cue) => cue.sourceCueId === undefined)).toBe(true)
  })

  it('keeps authored utterances inside one audio segment without synthesizing display-caption fragments', () => {
    const job = buildCourtWeekAudioJobs(elevenMinutesCourtWeek).jobs[0]
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

    const continuation = mondayCues.find((cue) => cue.id === 'mon-orr-cross-1--caption-3')!
    const mixedContinuation = mondayCues.find((cue) => cue.id === 'mon-orr-cross-1--caption-5')!
    expect(continuation.speaker).toBe('Nella Orr')
    expect(splitCueUtterances(continuation).map((cue) => cue.speaker)).toEqual(['Nella Orr'])
    expect(splitCueUtterances(mixedContinuation).map((cue) => cue.speaker)).toEqual([
      'Defence counsel Corin Dax', 'Nella Orr',
    ])

    const pleaAnswer = mondayCues.find((cue) => cue.id === 'mon-plea--caption-4')!
    const pleaEffect = mondayCues.find((cue) => cue.id === 'mon-plea-effect')!
    expect(pleaAnswer).toMatchObject({
      speaker: 'Clerk',
      text: 'The accused answers: Not Guilty.',
    })
    expect(pleaEffect).toMatchObject({
      speaker: 'Judge Sel Aven',
      text: 'That plea denies every element the Crown must prove.',
    })
    expect(splitCueUtterances(pleaEffect).map((cue) => cue.speaker)).toEqual(['Judge Sel Aven'])
  })
})
