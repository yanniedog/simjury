import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import {
  MONDAY_SOURCE_CUE_IDS,
  MONDAY_SPEECH_CANDIDATE,
} from './mondaySpeechCandidate'
import { elevenMinutesSessions } from './sessions'
import {
  assertReviewedSpeechCue,
  findPotentialAttributions,
} from './speechReview'

const activeMonday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-monday')
if (!activeMonday) throw new Error('Active Monday session is missing')

const activeSourceCueIds = [...new Set(
  activeMonday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

const cueById = (id: typeof MONDAY_SOURCE_CUE_IDS[number]) => {
  const candidate = MONDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error(`Missing Monday candidate cue ${id}`)
  return candidate
}

describe('inactive Monday reviewed speech candidate', () => {
  it('covers every active Monday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...MONDAY_SOURCE_CUE_IDS].sort())
    expect(MONDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(MONDAY_SOURCE_CUE_IDS)
    expect(new Set(MONDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(17)

    const turnIds = MONDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every explicit turn and contains no embedded live hand-off', () => {
    for (const candidate of MONDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toEqual([])
    }
  })

  it.each([
    ['third-person plea', 'The accused answers: Not guilty.'],
    ['labelled cross-examination', 'Dax: No further questions.'],
  ])('fails closed if %s is hidden inside a reviewed cue', (_label, hiddenSpeech) => {
    const candidate = cueById('mon-plea')
    expect(() => assertReviewedSpeechCue({
      ...candidate,
      sourceText: `${candidate.sourceText} ${hiddenSpeech}`,
    })).toThrow(/undeclared attributed speech/i)
  })

  it('orders empanelment, oath, plea and directions before the opening', () => {
    const proceduralEvents = MONDAY_SPEECH_CANDIDATE
      .filter(({ event }) => ['empanelment', 'oath', 'plea', 'preliminary-direction'].includes(event))
      .map(({ event }) => event)

    expect(proceduralEvents.slice(0, 5)).toEqual([
      'empanelment', 'oath', 'plea', 'preliminary-direction', 'preliminary-direction',
    ])
    expect(MONDAY_SPEECH_CANDIDATE.findIndex(({ event }) => event === 'crown-opening'))
      .toBeGreaterThan(MONDAY_SPEECH_CANDIDATE.findIndex(({ id }) => id === 'mon-prelim-2'))
  })

  it('gives the charge, question, plea and neutral plea direction to the proper actors', () => {
    expect(cueById('mon-plea').turns.map(({ actorId, legalAction, text }) => ({
      actorId, legalAction, text,
    }))).toEqual([
      {
        actorId: 'clerk', legalAction: 'charge-read',
        text: 'Mara Venn, you are charged with the murder of Ilan Saye. The Crown alleges that, while under a duty to dispatch emergency assistance, you intentionally withheld rescue action and caused his death.',
      },
      { actorId: 'clerk', legalAction: 'plea-question', text: 'How do you plead?' },
      { actorId: 'accused', legalAction: 'plea-answer', text: 'Not guilty.' },
      {
        actorId: 'judge', legalAction: 'direction',
        text: 'That plea is not evidence. It leaves the Crown to prove every element of the charge and does not require Mara Venn to prove anything.',
      },
    ])
  })

  it('locks actor and legal-action ownership for every Monday turn', () => {
    const ownership = Object.fromEntries(MONDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))

    expect(ownership).toEqual({
      'mon-arrival-1': ['court-officer:none'],
      'mon-arrival-2': ['judge:direction'],
      'mon-oath': ['clerk:none'],
      'mon-plea': ['clerk:charge-read', 'clerk:plea-question', 'accused:plea-answer', 'judge:direction'],
      'mon-prelim-1': ['judge:direction'],
      'mon-prelim-2': ['judge:direction'],
      'mon-crown-opening-1': ['crown-counsel:submission'],
      'mon-crown-opening-2': ['crown-counsel:submission'],
      'mon-def-reserve': ['defence-counsel:submission', 'judge:direction'],
      'mon-orr-chief-1': ['crown-counsel:question', 'nella-orr:answer', 'crown-counsel:question', 'nella-orr:answer', 'crown-counsel:question', 'nella-orr:answer'],
      'mon-orr-chief-2': ['crown-counsel:question', 'nella-orr:foundation', 'crown-counsel:question', 'nella-orr:answer', 'crown-counsel:tender', 'judge:admission', 'judge:limitation-direction'],
      'mon-orr-cross-1': ['defence-counsel:question', 'nella-orr:answer', 'defence-counsel:question', 'nella-orr:answer'],
      'mon-orr-cross-2': ['defence-counsel:question', 'nella-orr:answer', 'defence-counsel:question', 'nella-orr:answer'],
      'mon-elements-1': ['judge:direction'],
      'mon-elements-2': ['judge:direction'],
      'mon-adjourn-1': ['judge:direction'],
      'mon-adjourn-2': ['narrator:narration'],
    })
  })

  it('records the opening quotation as written provenance, not live speech', () => {
    const openingTurn = cueById('mon-crown-opening-1').turns[0]!
    const span = openingTurn.quotedSpans?.[0]
    expect(span).toMatchObject({ source: 'written', sourceActorId: 'accused' })
    const quote = openingTurn.text.slice(span?.start, span?.end)
    expect(openingTurn.text.indexOf(quote)).toBe(openingTurn.text.lastIndexOf(quote))
    expect(openingTurn.text.slice(span?.start, span?.end)).toBe('“hold, readiness.”')
  })

  it('uses the reviewed fictional Australian jurisdiction without legacy naming', () => {
    const text = MONDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ text }) => text)).join(' ')
    expect(text).toContain('State of Calder')
    expect(text).not.toMatch(/Orinth/i)
  })
})
