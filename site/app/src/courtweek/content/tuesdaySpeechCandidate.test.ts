import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeechCue, findPotentialAttributions } from './speechReview'
import {
  TUESDAY_SOURCE_CUE_IDS,
  TUESDAY_SPEECH_CANDIDATE,
  type TuesdaySourceCueId,
} from './tuesdaySpeechCandidate'

const activeTuesday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-tuesday')
if (!activeTuesday) throw new Error('Active Tuesday session is missing')

const activeSourceCueIds = [...new Set(
  activeTuesday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function cueById(id: TuesdaySourceCueId) {
  const candidate = TUESDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error(`Missing Tuesday candidate cue ${id}`)
  return candidate
}

describe('inactive Tuesday reviewed speech candidate', () => {
  it('covers every active Tuesday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...TUESDAY_SOURCE_CUE_IDS].sort())
    expect(TUESDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(TUESDAY_SOURCE_CUE_IDS)
    expect(new Set(TUESDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(20)

    const turnIds = TUESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(58)
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every turn and permits only declared, non-live reported attributions', () => {
    for (const candidate of TUESDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      const declarations = candidate.attributions ?? []
      expect(declarations.filter(({ kind }) => kind === 'live'), candidate.id).toEqual([])
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toHaveLength(declarations.length)
    }
  })

  it.each([
    ['Renn hand-off', 'Renn: I tender the recording.'],
    ['Dorn answer', 'Dorn answers: Yes.'],
    ['Judge ruling', 'Judge rules: Sustained.'],
  ])('fails closed if an undeclared %s is embedded in a cue', (_label, hiddenSpeech) => {
    const candidate = cueById('tue-def-objection')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: `${candidate.sourceText} ${hiddenSpeech}`,
    })).toThrow(/undeclared attributed speech/i)
  })

  it('locks actor and legal-action ownership for all sixty turns', () => {
    const ownership = Object.fromEntries(TUESDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))

    expect(ownership).toEqual({
      'tue-resume-1': ['judge:direction'],
      'tue-resume-2': ['judge:direction'],
      'tue-dorn-chief-1': ['peli-dorn:answer'],
      'tue-def-objection': ['crown-counsel:question', 'defence-counsel:objection', 'crown-counsel:submission', 'judge:ruling', 'judge:limitation-direction'],
      'tue-def-ruling': ['judge:limitation-direction'],
      'tue-dorn-chief-2': ['peli-dorn:answer'],
      'tue-recording-foundation': ['crown-counsel:question', 'peli-dorn:foundation', 'crown-counsel:tender', 'judge:admission', 'judge:limitation-direction'],
      'tue-recording-play': ['ilan-saye:none', 'peli-dorn:none', 'accused:none', 'ilan-saye:none', 'recorded-channel:exhibit-playback', 'accused:none', 'ilan-saye:none', 'recorded-channel:exhibit-playback'],
      'tue-dorn-cross-1': ['defence-counsel:question', 'peli-dorn:answer', 'defence-counsel:question', 'peli-dorn:answer', 'defence-counsel:question', 'peli-dorn:answer', 'defence-counsel:question', 'peli-dorn:answer'],
      'tue-dorn-cross-2': ['peli-dorn:answer'],
      'tue-dorn-re-1': ['crown-counsel:question', 'peli-dorn:answer', 'crown-counsel:question', 'peli-dorn:answer', 'judge:limitation-direction'],
      'tue-re-direction': ['judge:direction'],
      'tue-mir-chief-1': ['tovan-mir:foundation', 'crown-counsel:tender', 'judge:admission'],
      'tue-mir-chief-2': ['tovan-mir:foundation', 'crown-counsel:tender', 'judge:admission'],
      'tue-mir-chief-3': ['tovan-mir:foundation'],
      'tue-mir-cross-1': ['defence-counsel:question', 'tovan-mir:answer', 'defence-counsel:question', 'tovan-mir:answer', 'defence-counsel:question', 'tovan-mir:answer', 'defence-counsel:question', 'tovan-mir:answer'],
      'tue-log-direction': ['judge:direction'],
      'tue-recording-final-admission': ['judge:admission', 'judge:limitation-direction'],
      'tue-adjourn-1': ['judge:direction'],
      'tue-adjourn-2': ['court-officer:none'],
    })
  })

  it('keeps the hearsay ruling pre-answer and separates ruling from limitation', () => {
    const turns = cueById('tue-def-objection').turns
    expect(turns.some(({ actorId }) => actorId === 'peli-dorn')).toBe(false)
    expect(turns.slice(-2).map(({ actorId, legalAction, text }) => ({ actorId, legalAction, text }))).toEqual([
      { actorId: 'judge', legalAction: 'ruling', text: 'Sustained. The witness must not answer.' },
      { actorId: 'judge', legalAction: 'limitation-direction', text: 'Ask only about words and sounds Dorn personally perceived.' },
    ])
  })

  it('distinguishes courtroom reports, primary playback and written quotations', () => {
    const allTurns = TUESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    expect(allTurns.filter(({ speechMode }) => speechMode === 'reported-testimony').map(({ id }) => id)).toEqual([
      'tue-dorn-chief-1__1', 'tue-dorn-chief-2__1', 'tue-dorn-cross-1__8',
    ])
    expect(cueById('tue-recording-play').turns.every(({ speechMode }) => speechMode === 'recording-playback')).toBe(true)

    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      `${turn.id}|${turn.text.slice(span.start, span.end)}|${span.source}|${span.sourceActorId ?? '-'}`))
    expect(provenance).toEqual([
      'tue-dorn-chief-1__1|“survey vessel Lumen, beacon AR-71, taking water.”|reported|ilan-saye',
      'tue-dorn-chief-1__1|“AR-71, I have your position.”|reported|accused',
      'tue-dorn-chief-2__1|“Hold Kestrel. Keep this at priority three.”|reported|accused',
      'tue-dorn-chief-2__1|“No. Seventy-one waits.”|reported|accused',
      'tue-dorn-cross-1__8|“seventy-one waits.”|reported|accused',
      'tue-dorn-re-1__1|“seventy-one waits,”|reported|accused',
      'tue-mir-chief-2__1|“hold—readiness,”|written|accused',
      'tue-mir-cross-1__1|“Apply selected priority?”|written|-',
      'tue-mir-cross-1__3|“Delay may kill”|written|-',
    ])
    for (const turn of allTurns) {
      const literalQuotes = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
      const reviewedQuotes = (turn.quotedSpans ?? []).map((span) => turn.text.slice(span.start, span.end))
      expect(reviewedQuotes, turn.id).toEqual(literalQuotes)
      for (const quote of reviewedQuotes) {
        expect(turn.text.indexOf(quote), `${turn.id}: ${quote}`).toBe(turn.text.lastIndexOf(quote))
      }
    }
  })

  it('starts provisional status at the operative admission, warns, then waits for later foundation', () => {
    const transitions = TUESDAY_SPEECH_CANDIDATE.flatMap((candidate, index) => (
      candidate.recordingAdmission ? [{ cueId: candidate.id, index, ...candidate.recordingAdmission }] : []
    ))
    expect(transitions).toEqual([
      { cueId: 'tue-recording-foundation', index: 6, evidenceId: 'ex-distress', status: 'provisional', operativeTurnId: 'tue-recording-foundation__4', warningTurnId: 'tue-recording-foundation__5' },
      { cueId: 'tue-recording-final-admission', index: 17, evidenceId: 'ex-distress', status: 'final', operativeTurnId: 'tue-recording-final-admission__1' },
    ])
    const turnIds = new Set(TUESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id)))
    for (const transition of transitions) {
      expect(turnIds.has(transition.operativeTurnId), transition.operativeTurnId).toBe(true)
      if ('warningTurnId' in transition) {
        expect(turnIds.has(transition.warningTurnId), transition.warningTurnId).toBe(true)
      }
    }
    expect(cueById('tue-resume-1').sourceText).toContain('Its evidentiary status and any limits will be stated before it is played.')

    const provisionalTurns = cueById('tue-recording-foundation').turns
    expect(provisionalTurns.map(({ legalAction }) => legalAction)).toEqual([
      'question', 'foundation', 'tender', 'admission', 'limitation-direction',
    ])
    expect(provisionalTurns[4]?.text).toMatch(/not finally admitted.*actually audible.*advocate’s description/is)
    expect(cueById('tue-mir-chief-3').turns[0]).toMatchObject({
      actorId: 'tovan-mir', legalAction: 'foundation',
    })
    expect(transitions[0]!.index).toBeLessThan(TUESDAY_SOURCE_CUE_IDS.indexOf('tue-recording-play'))
    expect(TUESDAY_SOURCE_CUE_IDS.indexOf('tue-mir-chief-3')).toBeLessThan(transitions[1]!.index)
  })
})
