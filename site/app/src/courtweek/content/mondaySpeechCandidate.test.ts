import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import {
  MONDAY_OATH_CANDIDATES,
  MONDAY_REVIEW_ORDER,
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

const allMondayCandidates = [...MONDAY_SPEECH_CANDIDATE, ...MONDAY_OATH_CANDIDATES]

const cueById = (id: (typeof allMondayCandidates)[number]['id']) => {
  const candidate = allMondayCandidates.find((cue) => cue.id === id)
  if (!candidate) throw new Error(`Missing Monday candidate cue ${id}`)
  return candidate
}

describe('inactive Monday reviewed speech candidate', () => {
  it('covers every active Monday source and both oath choices fail closed', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...MONDAY_SOURCE_CUE_IDS].sort())
    expect(MONDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(
      MONDAY_SOURCE_CUE_IDS.filter((id) => id !== 'mon-oath'),
    )
    expect(MONDAY_OATH_CANDIDATES.map(({ sourceCueId }) => sourceCueId)).toEqual(['mon-oath', 'mon-oath'])
    expect(MONDAY_OATH_CANDIDATES.map(({ runtimeVariant }) => runtimeVariant)).toEqual([
      'juror-promise:oath', 'juror-promise:affirmation',
    ])
    expect(new Set(allMondayCandidates.flatMap(({ sourceCueId }) => sourceCueId)).size).toBe(17)

    const turnIds = allMondayCandidates.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every explicit turn and contains no embedded live hand-off', () => {
    for (const candidate of allMondayCandidates) {
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

  it.each(MONDAY_OATH_CANDIDATES)('orders $runtimeVariant before plea and directions', (selected) => {
    const other = MONDAY_OATH_CANDIDATES.find(({ id }) => id !== selected.id)!
    const branch = MONDAY_REVIEW_ORDER.filter((id) => id !== other.id)
      .map((id) => cueById(id))
    expect(branch.map(({ event }) => event).slice(1, 6)).toEqual([
      'empanelment', 'oath', 'plea', 'preliminary-direction', 'preliminary-direction',
    ])
    expect(branch.findIndex(({ event }) => event === 'crown-opening'))
      .toBeGreaterThan(branch.findIndex(({ id }) => id === 'mon-prelim-2'))
  })

  it('administers each selected promise through the Clerk and records the private response action', () => {
    expect(MONDAY_OATH_CANDIDATES.map(({ runtimeVariant, jurorAction, turns }) => ({
      runtimeVariant, jurorAction,
      actors: turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
      text: turns[0]!.text,
    }))).toEqual([
      {
        runtimeVariant: 'juror-promise:oath', jurorAction: 'I swear',
        actors: ['clerk:oath-administered'],
        text: expect.stringContaining('swear by Almighty God'),
      },
      {
        runtimeVariant: 'juror-promise:affirmation', jurorAction: 'I affirm',
        actors: ['clerk:oath-administered'],
        text: expect.stringContaining('You and each of you affirm'),
      },
    ])
    for (const cue of MONDAY_OATH_CANDIDATES) {
      expect(cue.turns[0]!.text).toContain('faithfully and impartially')
      expect(cue.turns[0]!.text).toContain('true verdict according to the evidence')
    }
  })

  it('gives the charge, question, plea and neutral plea direction to the proper actors', () => {
    expect(cueById('mon-plea').turns.map(({ actorId, legalAction, text }) => ({
      actorId, legalAction, text,
    }))).toEqual([
      {
        actorId: 'clerk', legalAction: 'charge-read',
        text: 'Mara Venn, you are charged with the murder of Ilan Saye. The charge alleges that, in the State of Calder, while under a duty to dispatch emergency assistance, you intentionally withheld rescue action, thereby causing Ilan Saye’s death, and that you did so intending to cause death or really serious injury.',
      },
      { actorId: 'clerk', legalAction: 'plea-question', text: 'How do you plead?' },
      { actorId: 'accused', legalAction: 'plea-answer', text: 'Not guilty.' },
      {
        actorId: 'judge', legalAction: 'direction',
        text: 'That plea puts the charge in issue. It is not evidence. The Crown must prove every element of the charge beyond reasonable doubt. Mara Venn is not required to prove anything.',
      },
    ])
  })

  it('locks actor and legal-action ownership for every Monday turn', () => {
    const ownership = Object.fromEntries(allMondayCandidates.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => `${actorId}:${legalAction}`),
    ]))

    expect(ownership).toEqual({
      'mon-arrival-1': ['narrator:narration', 'court-officer:none'],
      'mon-arrival-2': ['judge:direction'],
      'mon-oath-oath': ['clerk:oath-administered'],
      'mon-oath-affirmation': ['clerk:oath-administered'],
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
      'mon-adjourn-2': ['court-officer:none', 'narrator:narration'],
    })
  })

  it('records the opening quotation as written provenance, not live speech', () => {
    const openingTurn = cueById('mon-crown-opening-1').turns[0]!
    const span = openingTurn.quotedSpans?.[0]
    expect(span).toMatchObject({ source: 'written', sourceActorId: 'accused' })
    const quote = openingTurn.text.slice(span?.start, span?.end)
    expect(openingTurn.text.indexOf(quote)).toBe(openingTurn.text.lastIndexOf(quote))
    expect(openingTurn.text.slice(span?.start, span?.end)).toBe('“hold—readiness”')
    expect(openingTurn.text).toContain('entry “hold—readiness”.')
  })

  it('uses the reviewed fictional Australian jurisdiction without legacy naming', () => {
    const text = allMondayCandidates.flatMap(({ turns }) => turns.map(({ text }) => text)).join(' ')
    expect(text).toContain('State of Calder')
    expect(text).not.toMatch(/Orinth/i)
  })

  it('keeps fiction and saved-progress mechanics with narration, and adjournment with the Judge', () => {
    const arrival = cueById('mon-arrival-1')
    expect(arrival.turns[0]).toMatchObject({ actorId: 'narrator', speechMode: 'narration' })
    expect(arrival.turns[0]!.text).toMatch(/fictional|invented/u)
    expect(arrival.turns[1]).toMatchObject({ actorId: 'court-officer', speechMode: 'live-proceeding' })
    expect(arrival.turns[1]!.text).not.toMatch(/simulation|fiction/u)
    expect(cueById('mon-arrival-2').turns[0]!.text).not.toMatch(/simulation|fiction/u)
    expect(cueById('mon-adjourn-1').turns[0]!.text).toContain('Court is adjourned')
    expect(cueById('mon-adjourn-2').turns.map(({ actorId, text }) => ({ actorId, text }))).toEqual([
      { actorId: 'court-officer', text: 'All rise.' },
      { actorId: 'narrator', text: expect.stringContaining('evidence about the distress recording') },
    ])
    expect(cueById('mon-adjourn-2').sourceText).not.toMatch(/authenticated distress recording/i)
  })

  it('uses the controlling preliminary burden without a blanket possibilities formulation', () => {
    const direction = cueById('mon-prelim-1').sourceText
    expect(direction).toContain('prove each element beyond reasonable doubt')
    expect(direction).not.toMatch(/exclude every reasonable possibility/i)
  })
})
