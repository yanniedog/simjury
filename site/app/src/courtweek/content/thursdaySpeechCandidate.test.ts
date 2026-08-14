import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeechCue, findPotentialAttributions } from './speechReview'
import {
  THURSDAY_SOURCE_CUE_IDS,
  THURSDAY_SPEECH_CANDIDATE,
  type ThursdaySourceCueId,
} from './thursdaySpeechCandidate'

const activeThursday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-thursday')
if (!activeThursday) throw new Error('Active Thursday session is missing')

const activeSourceCueIds = [...new Set(
  activeThursday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function cueById(id: ThursdaySourceCueId) {
  const candidate = THURSDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error(`Missing Thursday candidate cue ${id}`)
  return candidate
}

describe('inactive Thursday reviewed speech candidate', () => {
  it('covers every active Thursday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...THURSDAY_SOURCE_CUE_IDS].sort())
    expect(THURSDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(THURSDAY_SOURCE_CUE_IDS)
    expect(new Set(THURSDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(17)

    const turnIds = THURSDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(44)
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every explicit turn without embedded live attribution', () => {
    for (const candidate of THURSDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toEqual([])
    }
  })

  it.each([
    ['Renn question', 'Renn: No diagnostic was required?'],
    ['Quill answer', 'Quill answers: No.'],
    ['Judge ruling', 'Judge rules: Sustained.'],
  ])('fails closed if an undeclared %s is embedded in a cue', (_label, hiddenSpeech) => {
    const candidate = cueById('thu-crown-objection')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: `${candidate.sourceText} ${hiddenSpeech}`,
    })).toThrow(/undeclared attributed speech/i)
  })

  it('locks actor and legal-action ownership for all forty-four turns', () => {
    const ownership = Object.fromEntries(THURSDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))
    expect(ownership).toEqual({
      'thu-def-opening': ['defence-counsel:submission'],
      'thu-silence': ['defence-counsel:submission', 'judge:direction'],
      'thu-rusk-chief-1': ['tali-rusk:foundation', 'tali-rusk:answer'],
      'thu-rusk-chief-2': ['tali-rusk:answer'],
      'thu-rusk-cross-1': ['crown-counsel:question', 'tali-rusk:answer', 'crown-counsel:question', 'tali-rusk:answer', 'crown-counsel:question', 'tali-rusk:answer'],
      'thu-crown-objection': ['defence-counsel:question', 'crown-counsel:objection', 'judge:ruling', 'judge:limitation-direction'],
      'thu-rusk-re-1': ['defence-counsel:question', 'tali-rusk:answer'],
      'thu-quill-chief-1': ['sera-quill:answer'],
      'thu-warning-admitted': ['sera-quill:foundation', 'sera-quill:answer', 'sera-quill:answer', 'defence-counsel:tender', 'judge:admission', 'judge:limitation-direction'],
      'thu-quill-cross-1': ['crown-counsel:question', 'sera-quill:answer', 'crown-counsel:question', 'sera-quill:answer', 'crown-counsel:question', 'sera-quill:answer', 'crown-counsel:question', 'sera-quill:answer'],
      'thu-quill-re-1': ['defence-counsel:question', 'sera-quill:answer', 'defence-counsel:question', 'sera-quill:answer'],
      'thu-defence-theory': ['defence-counsel:submission', 'judge:direction'],
      'thu-silence-repeat': ['judge:direction'],
      'thu-def-close-1': ['defence-counsel:submission'],
      'thu-close-direction': ['judge:direction'],
      'thu-adjourn-1': ['judge:direction'],
      'thu-adjourn-2': ['court-officer:none'],
    })
  })

  it('separates the accused election from both no-adverse-inference directions', () => {
    const silenceReviews = THURSDAY_SPEECH_CANDIDATE.flatMap((candidate, index) => (
      candidate.silenceDirection ? [{ cueId: candidate.id, index, ...candidate.silenceDirection }] : []
    ))
    expect(silenceReviews).toEqual([
      { cueId: 'thu-silence', index: 1, adverseInference: 'forbidden', electionTurnId: 'thu-silence__1', operativeTurnId: 'thu-silence__2' },
      { cueId: 'thu-silence-repeat', index: 12, adverseInference: 'forbidden', operativeTurnId: 'thu-silence-repeat__1' },
    ])
    const firstSilence = cueById('thu-silence').turns
    expect(firstSilence[0]).toMatchObject({ actorId: 'defence-counsel', legalAction: 'submission' })
    expect(firstSilence[1]).toMatchObject({ actorId: 'judge', legalAction: 'direction' })
    expect(firstSilence[1]?.text).toMatch(/absolute right.*cannot fill a gap.*show guilt.*adverse purpose/is)
    expect(cueById('thu-silence-repeat').sourceText).toMatch(/do not accept.*do not reject.*did not testify/is)
    expect(THURSDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns).some(({ actorId }) => actorId === 'accused')).toBe(false)
  })

  it('keeps expert foundation, mechanism and limits as distinct oral evidence', () => {
    expect(cueById('thu-rusk-chief-1').turns.map(({ legalAction }) => legalAction)).toEqual(['foundation', 'answer'])
    expect(cueById('thu-rusk-chief-1').sourceText).toMatch(/did not interview or diagnose.*does not tell you Venn made that error/is)
    expect(cueById('thu-rusk-re-1').sourceText).toMatch(/reasonably possible.*not an opinion on intention, credibility or verdict/is)
    expect(THURSDAY_SPEECH_CANDIDATE.slice(2, 7).some(({ warningAdmission }) => warningAdmission)).toBe(false)
  })

  it('admits the maintenance entry only after foundation, reading, explanation and defence tender', () => {
    const candidate = cueById('thu-warning-admitted')
    expect(candidate.warningAdmission).toEqual({
      evidenceId: 'ex-warning', status: 'final',
      operativeTurnId: 'thu-warning-admitted__5', limitationTurnId: 'thu-warning-admitted__6',
    })
    expect(candidate.turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`)).toEqual([
      'sera-quill:foundation', 'sera-quill:answer', 'sera-quill:answer',
      'defence-counsel:tender', 'judge:admission', 'judge:limitation-direction',
    ])
    expect(candidate.turns[1]).toMatchObject({ actorId: 'sera-quill', speechMode: 'written-text-read' })
    expect(THURSDAY_SOURCE_CUE_IDS.indexOf('thu-quill-chief-1')).toBeLessThan(THURSDAY_SOURCE_CUE_IDS.indexOf(candidate.id))
  })

  it('closes the defence case after its evidence and before the Judge closes the record', () => {
    const closure = cueById('thu-def-close-1')
    expect(closure.defenceClosure).toEqual({ status: 'closed', operativeTurnId: 'thu-def-close-1__1' })
    expect(closure.turns[0]).toMatchObject({ actorId: 'defence-counsel', legalAction: 'submission' })
    expect(THURSDAY_SOURCE_CUE_IDS.indexOf('thu-quill-re-1')).toBeLessThan(THURSDAY_SOURCE_CUE_IDS.indexOf(closure.id))
    expect(THURSDAY_SOURCE_CUE_IDS.indexOf(closure.id)).toBeLessThan(THURSDAY_SOURCE_CUE_IDS.indexOf('thu-close-direction'))
    const afterClosure = THURSDAY_SPEECH_CANDIDATE.slice(14).flatMap(({ turns }) => turns)
    expect(afterClosure.some(({ legalAction }) => ['answer', 'foundation', 'tender', 'admission'].includes(legalAction))).toBe(false)
    expect(cueById('thu-close-direction').sourceText).toMatch(/All evidence is complete.*no reply evidence/is)
  })

  it('records every literal quotation with ordered source provenance', () => {
    const allTurns = THURSDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      `${turn.id}|${turn.text.slice(span.start, span.end)}|${span.source}|${span.sourceActorId ?? '-'}`))
    expect(provenance).toEqual([
      'thu-rusk-chief-2__1|“hold—readiness”|written|accused',
      'thu-rusk-cross-1__1|“seventy-one waits”|reported|accused',
      'thu-warning-admitted__2|“Monitor on launch; abort for sustained pressure loss.”|written|sera-quill',
    ])
    for (const turn of allTurns) {
      const literalQuotes = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
      const reviewedQuotes = (turn.quotedSpans ?? []).map((span) => turn.text.slice(span.start, span.end))
      expect(reviewedQuotes, turn.id).toEqual(literalQuotes)
    }
  })
})
