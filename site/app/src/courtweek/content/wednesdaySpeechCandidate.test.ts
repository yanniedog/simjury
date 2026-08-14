import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeechCue, findPotentialAttributions } from './speechReview'
import { TUESDAY_SPEECH_CANDIDATE } from './tuesdaySpeechCandidate'
import {
  WEDNESDAY_SOURCE_CUE_IDS,
  WEDNESDAY_SPEECH_CANDIDATE,
  type WednesdaySourceCueId,
} from './wednesdaySpeechCandidate'

const activeWednesday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-wednesday')
if (!activeWednesday) throw new Error('Active Wednesday session is missing')

const activeSourceCueIds = [...new Set(
  activeWednesday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function cueById(id: WednesdaySourceCueId) {
  const candidate = WEDNESDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error(`Missing Wednesday candidate cue ${id}`)
  return candidate
}

describe('inactive Wednesday reviewed speech candidate', () => {
  it('covers every active Wednesday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...WEDNESDAY_SOURCE_CUE_IDS].sort())
    expect(WEDNESDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(WEDNESDAY_SOURCE_CUE_IDS)
    expect(new Set(WEDNESDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(19)

    const turnIds = WEDNESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(61)
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every turn and permits only declared reported attribution', () => {
    for (const candidate of WEDNESDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      const declarations = candidate.attributions ?? []
      expect(declarations.filter(({ kind }) => kind === 'live'), candidate.id).toEqual([])
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toHaveLength(declarations.length)
    }
  })

  it.each([
    ['Renn tender', 'Renn: I tender the memorandum.'],
    ['Vale answer', 'Vale answers: Yes.'],
    ['Judge admission', 'Judge rules: Admitted.'],
  ])('fails closed if an undeclared %s is embedded in a cue', (_label, hiddenSpeech) => {
    const candidate = cueById('wed-vale-chief-1')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: `${candidate.sourceText} ${hiddenSpeech}`,
    })).toThrow(/undeclared attributed speech/i)
  })

  it('locks actor and legal-action ownership for all sixty-one turns', () => {
    const ownership = Object.fromEntries(WEDNESDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))
    expect(ownership).toEqual({
      'wed-resume-1': ['judge:direction'],
      'wed-resume-2': ['judge:direction'],
      'wed-pell-chief-1': ['jaro-pell:answer'],
      'wed-ready-admitted': ['jaro-pell:foundation', 'crown-counsel:tender', 'judge:admission', 'judge:limitation-direction'],
      'wed-pell-cross-1': ['defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer'],
      'wed-pell-re-1': ['crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer'],
      'wed-vos-chief-1': ['eren-vos:foundation', 'eren-vos:answer'],
      'wed-vos-cross-1': ['defence-counsel:question', 'eren-vos:answer', 'defence-counsel:question', 'eren-vos:answer', 'defence-counsel:question', 'eren-vos:answer'],
      'wed-vos-re-1': ['crown-counsel:question', 'eren-vos:answer'],
      'wed-def-objection': ['crown-counsel:question', 'defence-counsel:objection', 'defence-counsel:submission', 'crown-counsel:submission', 'judge:ruling', 'judge:limitation-direction'],
      'wed-vale-chief-1': ['oren-vale:foundation', 'oren-vale:answer', 'crown-counsel:tender', 'defence-counsel:submission', 'judge:admission', 'judge:limitation-direction'],
      'wed-motive-ruling': ['judge:limitation-direction'],
      'wed-vale-cross-1': ['defence-counsel:question', 'oren-vale:answer', 'defence-counsel:question', 'oren-vale:answer', 'defence-counsel:question', 'oren-vale:answer'],
      'wed-blurt': ['defence-counsel:question', 'oren-vale:answer', 'oren-vale:answer', 'defence-counsel:objection'],
      'wed-postanswer-ruling': ['judge:ruling', 'judge:limitation-direction'],
      'wed-record-admitted': ['crown-counsel:tender', 'defence-counsel:submission', 'judge:admission', 'judge:limitation-direction'],
      'wed-crown-close-1': ['crown-counsel:submission'],
      'wed-adjourn-1': ['judge:direction'],
      'wed-adjourn-2': ['court-officer:none'],
    })
  })

  it('admits each exhibit only after witness foundation and counsel tender', () => {
    const tuesdayReadyFoundation = TUESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'tue-mir-chief-3')
    expect(tuesdayReadyFoundation?.turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`))
      .toEqual(['tovan-mir:foundation'])

    const admissions = WEDNESDAY_SPEECH_CANDIDATE.flatMap((candidate, index) => (
      candidate.evidenceAdmission ? [{ cueId: candidate.id, index, ...candidate.evidenceAdmission }] : []
    ))
    expect(admissions).toEqual([
      { cueId: 'wed-ready-admitted', index: 3, evidenceId: 'ex-ready-display', status: 'final', operativeTurnId: 'wed-ready-admitted__3', limitationTurnId: 'wed-ready-admitted__4' },
      { cueId: 'wed-vale-chief-1', index: 10, evidenceId: 'ex-review', status: 'final', operativeTurnId: 'wed-vale-chief-1__5', limitationTurnId: 'wed-vale-chief-1__6' },
      { cueId: 'wed-record-admitted', index: 15, evidenceId: 'ex-competing', status: 'final', operativeTurnId: 'wed-record-admitted__3', limitationTurnId: 'wed-record-admitted__4' },
    ])
    for (const admission of admissions) {
      const candidate = cueById(admission.cueId)
      const operative = candidate.turns.find(({ id }) => id === admission.operativeTurnId)
      const limitation = candidate.turns.find(({ id }) => id === admission.limitationTurnId)
      expect(operative).toMatchObject({ actorId: 'judge', legalAction: 'admission' })
      expect(limitation).toMatchObject({ actorId: 'judge', legalAction: 'limitation-direction' })
      expect(candidate.turns.findIndex(({ id }) => id === admission.operativeTurnId))
        .toBeGreaterThan(candidate.turns.findIndex(({ legalAction }) => legalAction === 'tender'))
    }
  })

  it('keeps the relevance ruling pre-answer and all motive limitations with the Judge', () => {
    const objection = cueById('wed-def-objection').turns
    expect(objection.some(({ actorId }) => actorId === 'oren-vale')).toBe(false)
    expect(objection.slice(-2).map(({ actorId, legalAction }) => `${actorId}:${legalAction}`)).toEqual([
      'judge:ruling', 'judge:limitation-direction',
    ])
    expect([
      objection.at(-1),
      cueById('wed-vale-chief-1').turns.at(-1),
      cueById('wed-motive-ruling').turns[0],
    ].every((turn) => turn?.actorId === 'judge' && turn.legalAction === 'limitation-direction')).toBe(true)
  })

  it('strikes only after the volunteered answer and forbids every later reuse path', () => {
    const strike = cueById('wed-postanswer-ruling').strikeRuling
    expect(strike).toEqual({
      targetTurnId: 'wed-blurt__3', objectionTurnId: 'wed-blurt__4',
      operativeTurnId: 'wed-postanswer-ruling__1', restrictionTurnId: 'wed-postanswer-ruling__2',
      replay: 'forbidden',
    })
    const orderedIds = WEDNESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(orderedIds.indexOf(strike!.targetTurnId)).toBeLessThan(orderedIds.indexOf(strike!.objectionTurnId))
    expect(orderedIds.indexOf(strike!.objectionTurnId)).toBeLessThan(orderedIds.indexOf(strike!.operativeTurnId))

    const ruling = cueById('wed-postanswer-ruling').turns
    expect(ruling[0]).toMatchObject({ actorId: 'judge', legalAction: 'ruling' })
    expect(ruling[1]?.text).toMatch(/do not replay.*exhibits.*notes index.*closings.*deliberation prompts.*later analysis/is)
    expect(WEDNESDAY_SPEECH_CANDIDATE.slice(14).flatMap(({ sourceText }) => sourceText))
      .not.toContain('she had done this before')
  })

  it('records every literal quotation with ordered source provenance', () => {
    const allTurns = WEDNESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      `${turn.id}|${turn.text.slice(span.start, span.end)}|${span.source}|${span.sourceActorId ?? '-'}`))
    expect(provenance).toEqual([
      'wed-pell-chief-1__1|“Kestrel ready, warning monitored.”|reported|jaro-pell',
      'wed-vale-chief-1__2|“Ilan was trying to end my career.”|reported|accused',
    ])
    expect(allTurns.filter(({ speechMode }) => speechMode === 'reported-testimony').map(({ id }) => id)).toEqual([
      'wed-pell-chief-1__1', 'wed-vale-chief-1__2', 'wed-blurt__3',
    ])
    for (const turn of allTurns) {
      const literalQuotes = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
      const reviewedQuotes = (turn.quotedSpans ?? []).map((span) => turn.text.slice(span.start, span.end))
      expect(reviewedQuotes, turn.id).toEqual(literalQuotes)
    }
  })
})
