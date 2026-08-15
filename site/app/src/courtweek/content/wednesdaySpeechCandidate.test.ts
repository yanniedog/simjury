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
    expect(turnIds).toHaveLength(86)
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

  it('locks actor and legal-action ownership for every Wednesday turn', () => {
    const ownership = Object.fromEntries(WEDNESDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))
    expect(ownership).toEqual({
      'wed-resume-1': ['judge:direction'],
      'wed-resume-2': ['judge:direction'],
      'wed-pell-chief-1': ['crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer'],
      'wed-ready-admitted': ['crown-counsel:question', 'jaro-pell:foundation', 'crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:tender', 'judge:admission', 'judge:limitation-direction'],
      'wed-pell-cross-1': ['defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer', 'defence-counsel:question', 'jaro-pell:answer'],
      'wed-pell-re-1': ['crown-counsel:question', 'jaro-pell:answer', 'crown-counsel:question', 'jaro-pell:answer'],
      'wed-vos-chief-1': ['crown-counsel:question', 'eren-vos:foundation', 'crown-counsel:question', 'eren-vos:foundation', 'crown-counsel:question', 'eren-vos:answer'],
      'wed-vos-cross-1': ['defence-counsel:question', 'eren-vos:answer', 'defence-counsel:question', 'eren-vos:answer', 'defence-counsel:question', 'eren-vos:answer'],
      'wed-vos-re-1': ['crown-counsel:question', 'eren-vos:answer'],
      'wed-def-objection': ['crown-counsel:question', 'defence-counsel:objection', 'defence-counsel:submission', 'crown-counsel:submission', 'judge:ruling', 'judge:limitation-direction'],
      'wed-vale-chief-1': ['crown-counsel:question', 'oren-vale:answer', 'crown-counsel:question', 'oren-vale:foundation', 'crown-counsel:question', 'oren-vale:answer', 'crown-counsel:question', 'oren-vale:answer', 'crown-counsel:tender', 'defence-counsel:submission', 'judge:admission', 'judge:limitation-direction'],
      'wed-motive-ruling': ['judge:limitation-direction'],
      'wed-vale-cross-1': ['defence-counsel:question', 'oren-vale:answer', 'defence-counsel:question', 'oren-vale:answer', 'defence-counsel:question', 'oren-vale:answer'],
      'wed-blurt': ['defence-counsel:question', 'oren-vale:answer', 'oren-vale:answer', 'defence-counsel:objection'],
      'wed-postanswer-ruling': ['judge:ruling', 'judge:limitation-direction'],
      'wed-record-admitted': ['crown-counsel:tender', 'defence-counsel:submission', 'judge:admission', 'judge:limitation-direction'],
      'wed-crown-close-1': ['crown-counsel:submission'],
      'wed-adjourn-1': ['judge:direction'],
      'wed-adjourn-2': ['court-officer:none', 'narrator:narration'],
    })
  })

  it('admits each exhibit only after witness foundation and counsel tender', () => {
    const tuesdayReadyFoundation = TUESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'tue-mir-chief-3')
    expect(tuesdayReadyFoundation?.turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`))
      .toEqual([
        'crown-counsel:question', 'tovan-mir:answer',
        'crown-counsel:question', 'tovan-mir:foundation',
        'crown-counsel:question', 'tovan-mir:foundation',
      ])

    const admissions = WEDNESDAY_SPEECH_CANDIDATE.flatMap((candidate, index) => (
      candidate.evidenceAdmission ? [{ cueId: candidate.id, index, ...candidate.evidenceAdmission }] : []
    ))
    expect(admissions).toEqual([
      { cueId: 'wed-ready-admitted', index: 3, evidenceId: 'ex-ready-display', status: 'final', operativeTurnId: 'wed-ready-admitted__8', limitationTurnId: 'wed-ready-admitted__9' },
      { cueId: 'wed-vale-chief-1', index: 10, evidenceId: 'ex-review', status: 'final', operativeTurnId: 'wed-vale-chief-1__11', limitationTurnId: 'wed-vale-chief-1__12' },
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

  it('separates account attribution, record completeness and copy identity', () => {
    const memorandumFoundation = cueById('wed-vale-chief-1').turns[3]!.text
    expect(memorandumFoundation).toMatch(/retained under Ilan Saye’s authenticated account.*metadata has not changed since retention.*system does not show who operated that account/is)
    expect(memorandumFoundation).not.toMatch(/metadata identifies Saye as the author/is)

    const memorandumLimitation = cueById('wed-vale-chief-1').turns[11]!.text
    expect(memorandumLimitation).toMatch(/account and unchanged metadata do not establish that Saye personally wrote it.*authorship and weight are for you/is)

    const exportTender = cueById('wed-record-admitted').turns[0]!.text
    expect(exportTender).toMatch(/covers the whole hour because.*records each entry automatically.*first and last sequence numbers.*event count.*continuous sequence.*matching counts/is)
    expect(exportTender).toMatch(/generated this copy from the retained archive file.*digital fingerprint.*retained manifest/is)
    expect(exportTender).not.toMatch(/complete concurrent incident export|fingerprint.*covers the whole hour/is)
    expect(cueById('wed-record-admitted').turns[2]!.text).toBe('The concurrent incident export is admitted.')

    const mirFoundations = TUESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'tue-mir-chief-1')?.turns
    expect(mirFoundations?.[3]?.text).toMatch(/distinct ingestion entry.*sequence and ingestion entries for gaps/is)
    expect(mirFoundations?.[7]?.text).toMatch(/first and last sequence numbers.*event count.*continuous.*counts agreed/is)
    expect(mirFoundations?.[7]?.text).toMatch(/digital fingerprint.*retained manifest/is)
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
    expect(ruling[1]?.text).toMatch(/put those words out of your minds.*untested hearsay.*not evidence.*do not use or discuss them/is)
    expect(ruling.map(({ text }) => text).join(' ')).not.toMatch(/\breplay\b|notes index|deliberation prompts|later analysis/iu)
    expect(WEDNESDAY_SPEECH_CANDIDATE.slice(14).flatMap(({ sourceText }) => sourceText))
      .not.toContain('she had done this before')
  })

  it('leaves adjournment authority with the Judge and the ceremonial response with the officer', () => {
    expect(cueById('wed-adjourn-1').turns.at(-1)).toMatchObject({
      actorId: 'judge', legalAction: 'direction', text: expect.stringMatching(/court is adjourned/iu),
    })
    expect(cueById('wed-adjourn-2').turns).toMatchObject([
      { actorId: 'court-officer', legalAction: 'none', text: 'All rise.' },
      { actorId: 'narrator', legalAction: 'narration' },
    ])
  })

  it('records every literal quotation with ordered source provenance', () => {
    const allTurns = WEDNESDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      `${turn.id}|${turn.text.slice(span.start, span.end)}|${span.source}|${span.sourceActorId ?? '-'}`))
    expect(provenance).toEqual([
      'wed-pell-chief-1__8|“Kestrel ready, warning monitored.”|reported|jaro-pell',
      'wed-vale-chief-1__8|“Ilan was trying to end my career.”|reported|accused',
    ])
    expect(allTurns.filter(({ speechMode }) => speechMode === 'reported-testimony').map(({ id }) => id)).toEqual([
      'wed-pell-chief-1__8', 'wed-vale-chief-1__8', 'wed-blurt__3',
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
})
