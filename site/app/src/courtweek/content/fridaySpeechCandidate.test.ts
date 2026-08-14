import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeechCue, findPotentialAttributions } from './speechReview'
import { TUESDAY_SPEECH_CANDIDATE } from './tuesdaySpeechCandidate'
import {
  FRIDAY_SOURCE_CUE_IDS,
  FRIDAY_SPEECH_CANDIDATE,
  type FridaySourceCueId,
} from './fridaySpeechCandidate'

const activeFriday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-friday')
if (!activeFriday) throw new Error('Active Friday session is missing')

const activeSourceCueIds = [...new Set(
  activeFriday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function cueById(id: FridaySourceCueId) {
  const candidate = FRIDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error('Missing Friday candidate cue ' + id)
  return candidate
}

describe('inactive Friday reviewed speech candidate', () => {
  it('covers every active Friday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...FRIDAY_SOURCE_CUE_IDS].sort())
    expect(FRIDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(FRIDAY_SOURCE_CUE_IDS)
    expect(new Set(FRIDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(19)

    const turnIds = FRIDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(22)
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every explicit turn without embedded live attribution', () => {
    for (const candidate of FRIDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toEqual([])
      expect(candidate.sourceText).toBe(candidate.turns.map(({ text }) => text).join(' '))
    }
  })

  it.each([
    ['Court officer recall', 'Court officer says: Members of the jury, return.'],
    ['Renn address', 'Renn adds: The delay proves intent.'],
    ['Dax address', 'Dax replies: Causation is not proved.'],
    ['Judge direction', 'Judge says: Retire now.'],
  ])('fails closed if an undeclared %s is embedded in a cue', (_label, hiddenSpeech) => {
    const candidate = cueById('fri-submissions-2')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: candidate.sourceText + ' ' + hiddenSpeech,
    })).toThrow(/undeclared attributed speech/i)
  })

  it('locks actor and legal-action ownership for all twenty-two turns', () => {
    const ownership = Object.fromEntries(FRIDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => actorId + ':' + legalAction),
    ]))
    expect(ownership).toEqual({
      'fri-submissions-1': ['narrator:narration'],
      'fri-submissions-2': ['court-officer:none', 'judge:direction'],
      'fri-crown-closing-1': ['crown-counsel:submission'],
      'fri-crown-closing-2': ['crown-counsel:submission'],
      'fri-defence-closing-1': ['defence-counsel:submission'],
      'fri-defence-closing-2': ['defence-counsel:submission'],
      'fri-summing-burden': ['judge:direction'],
      'fri-summing-circumstantial': ['judge:direction'],
      'fri-summing-duty': ['judge:direction'],
      'fri-summing-causation': ['judge:direction'],
      'fri-summing-intent': ['judge:direction'],
      'fri-summing-manslaughter': ['judge:direction'],
      'fri-summing-no-compromise': ['judge:direction'],
      'fri-summing-expert': ['judge:limitation-direction'],
      'fri-summing-motive': ['judge:limitation-direction'],
      'fri-summing-exhibits': ['judge:limitation-direction'],
      'fri-retire-direction': ['judge:direction'],
      'fri-retire': ['judge:direction', 'court-officer:none'],
      'fri-adjourn': ['court-officer:none', 'judge:direction'],
    })
  })

  it('locks the complete Friday procedural order before any ballot', () => {
    expect(FRIDAY_SPEECH_CANDIDATE.map(({ id, procedureStage }) => id + ':' + procedureStage)).toEqual([
      'fri-submissions-1:jury-absent-submissions', 'fri-submissions-2:jury-recall',
      'fri-crown-closing-1:crown-address', 'fri-crown-closing-2:crown-address',
      'fri-defence-closing-1:defence-address', 'fri-defence-closing-2:defence-address',
      'fri-summing-burden:summing-up', 'fri-summing-circumstantial:summing-up',
      'fri-summing-duty:summing-up', 'fri-summing-causation:summing-up',
      'fri-summing-intent:summing-up', 'fri-summing-manslaughter:summing-up',
      'fri-summing-no-compromise:summing-up', 'fri-summing-expert:summing-up',
      'fri-summing-motive:summing-up', 'fri-summing-exhibits:summing-up',
      'fri-retire-direction:retirement-direction', 'fri-retire:retirement',
      'fri-adjourn:overnight-adjournment',
    ])
    expect(FRIDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns).some(
      ({ legalAction }) => legalAction === 'ballot-administration',
    )).toBe(false)
  })

  it('makes both jury recalls direct and reserves legal directions to the Judge', () => {
    const juryAbsent = cueById('fri-submissions-1')
    const firstRecall = cueById('fri-submissions-2')
    const overnightRecall = cueById('fri-adjourn')
    expect(juryAbsent.sourceText).toMatch(/waits outside.*do not hear what counsel says.*nothing from that argument becomes evidence/is)
    expect(juryAbsent.sourceText).not.toMatch(/Crown accepts|defence obtains|Judge rejects|proposed direction/i)
    expect(firstRecall.turns[0]).toMatchObject({ actorId: 'court-officer', speechMode: 'live-proceeding', legalAction: 'none' })
    expect(firstRecall.turns[0]?.text).toMatch(/^Members of the jury, please return to court\.$/u)
    expect(firstRecall.turns[1]).toMatchObject({ actorId: 'judge', speechMode: 'judicial-direction', legalAction: 'direction' })
    expect(overnightRecall.turns[0]?.text).toMatch(/^Members of the jury, please return briefly to court\.$/u)
    expect(FRIDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns).filter(
      ({ actorId }) => actorId === 'court-officer',
    ).every(({ legalAction }) => legalAction === 'none')).toBe(true)
    expect(firstRecall.sourceText + ' ' + overnightRecall.sourceText).not.toMatch(/court officer recalls|jury returns briefly/i)
  })

  it('keeps Crown and defence addresses separate, evidence-bound and subordinate to the directions', () => {
    const crown = cueById('fri-crown-closing-1').sourceText + ' ' + cueById('fri-crown-closing-2').sourceText
    const defence = cueById('fri-defence-closing-1').sourceText + ' ' + cueById('fri-defence-closing-2').sourceText
    expect(crown).toMatch(/clarification was available.*manslaughter separately, never as a compromise.*caused death.*high a risk/is)
    expect(defence).toMatch(/recognised error mechanism.*Causation remains uncertain.*Manslaughter is not a compromise.*Crown must prove/is)
    expect(cueById('fri-summing-burden').sourceText).toMatch(/addresses are submissions, not evidence.*presumed innocent.*has not testified.*beyond reasonable doubt/is)
  })

  it('keeps the verdict pathway and evidence limitations in the Judge’s voice', () => {
    expect(cueById('fri-summing-duty').sourceText).toMatch(/agreed.*21:16:08.*first live question/is)
    expect(cueById('fri-summing-causation').sourceText).toMatch(/^Your second question.*reasonable same-outcome possibility.*acquit of both/is)
    expect(cueById('fri-summing-intent').sourceText).toMatch(/^Third, only if the first two live questions are proved:.*only reasonable one/is)
    expect(cueById('fri-summing-manslaughter').sourceText).toMatch(/If, and only if, murder is not proved.*does not require an intention to harm/is)
    expect(cueById('fri-summing-no-compromise').sourceText).toMatch(/not a compromise.*separate elements.*Not Guilty/is)
    expect(cueById('fri-summing-expert').sourceText).toMatch(/Neither may decide legal causation.*do not give it greater weight/is)
    expect(cueById('fri-summing-motive').sourceText).toMatch(/only on possible knowledge and motive.*struck and are legally absent/is)
    expect(cueById('fri-summing-exhibits').sourceText).toMatch(/each exhibit with its limitation.*not mind.*not belief/is)
  })

  it('separates judicial retirement and adjournment authority from officer logistics', () => {
    expect(cueById('fri-retire').turns).toMatchObject([
      { actorId: 'judge', legalAction: 'direction' },
      { actorId: 'court-officer', legalAction: 'none' },
    ])
    expect(cueById('fri-retire').turns[0]?.text).toMatch(/retire to consider your verdict.*only the admitted exhibits.*deliberations are private/is)
    expect(cueById('fri-adjourn').turns[1]).toMatchObject({ actorId: 'judge', legalAction: 'direction' })
    expect(cueById('fri-adjourn').turns[1]?.text).toMatch(/taken no ballot.*authorise you to separate.*Do not discuss or research.*all twelve/is)
  })

  it('records every literal quotation with exact reported-source provenance', () => {
    const allTurns = FRIDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      turn.id + '|' + turn.text.slice(span.start, span.end) + '|' + span.source + '|' + (span.sourceActorId ?? '-')))
    expect(provenance).toEqual([
      'fri-crown-closing-1__1|“No. Seventy-one waits.”|reported|accused',
    ])
    const reportedSource = TUESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'tue-dorn-chief-2')
    expect(reportedSource?.sourceText).toContain('“No. Seventy-one waits.”')
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
