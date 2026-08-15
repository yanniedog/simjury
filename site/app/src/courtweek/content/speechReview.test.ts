import { describe, expect, it } from 'vitest'
import {
  assertLegalActionAuthority,
  assertReviewedSpeechCue,
  COURT_WEEK_ACTORS,
  findPotentialAttributions,
  type ReviewedSpeechCue,
  type SpokenTurn,
} from './speechReview'

const turn = (value: Partial<SpokenTurn> & Pick<SpokenTurn, 'id' | 'actorId' | 'text'>): SpokenTurn => ({
  displayLabel: COURT_WEEK_ACTORS.find(({ id }) => id === value.actorId)?.label ?? value.actorId,
  speechMode: 'live-proceeding', legalAction: 'none', ...value,
})
describe('Court Week reviewed speech contract', () => {
  it('has one stable actor id and one foreperson alias for every reviewed entity', () => {
    expect(new Set(COURT_WEEK_ACTORS.map(({ id }) => id)).size).toBe(COURT_WEEK_ACTORS.length)
    expect(COURT_WEEK_ACTORS.find(({ id }) => id === 'clerk')).toMatchObject({
      label: 'Judge’s Associate', aliases: expect.arrayContaining(['Clerk', 'the Clerk']),
    })
    expect(COURT_WEEK_ACTORS.find(({ id }) => id === 'court-officer')).toMatchObject({
      label: 'Court Attendant', aliases: expect.arrayContaining(['Court officer', 'the court officer']),
    })
    expect(COURT_WEEK_ACTORS.find(({ id }) => id === 'edda-rook')).toMatchObject({
      label: 'Edda Rook', aliases: expect.arrayContaining(['Foreperson Edda Rook']),
    })
  })
  it('recognises current and legacy officer references as the same stable actors', () => {
    expect(findPotentialAttributions(
      'Judge’s Associate asks. Clerk replies. Court Attendant says. Court officer confirms.',
    ).map(({ actorId }) => actorId)).toEqual(['clerk', 'clerk', 'court-officer', 'court-officer'])
  })
  it.each([
    ['plea', 'Mara Venn, how do you plead? The accused answers: Not Guilty.'],
    ['Sola summary', 'Sola Iven answers that the beacon matters.'],
    ['Kessa summary', 'Kessa answers immediately that the warning matters.'],
    ['another voice', 'Another voice asks whether READY proves safety.'],
    ['anonymous summary', 'Someone says that silence proves guilt.'],
    ['unlisted speech verb', 'Mara Venn states: Not guilty.'],
    ['unknown label', 'Qill: The warning permitted launch.'],
  ])('fails closed on undeclared or unknown attributed speech: %s', (_label, sourceText) => {
    expect(() => assertReviewedSpeechCue({
      id: 'fixture', sourceText, turns: [turn({ id: 'fixture__1', actorId: 'clerk', text: sourceText })],
    })).toThrow(/attributed speech|attributed speaker/i)
  })
  it('accepts a direct plea only when the accused owns an explicit reviewed turn', () => {
    const cue: ReviewedSpeechCue = {
      id: 'plea',
      sourceText: 'Clerk: How do you plead? The accused answers: Not Guilty.',
      turns: [
        turn({ id: 'plea__1', actorId: 'clerk', text: 'How do you plead?', legalAction: 'plea-question' }),
        turn({ id: 'plea__2', actorId: 'accused', text: 'Not Guilty.', legalAction: 'plea-answer' }),
      ],
      attributions: [
        { marker: 'Clerk:', actorId: 'clerk', kind: 'live' },
        { marker: 'The accused answers:', actorId: 'accused', kind: 'live' },
      ],
    }
    expect(() => assertReviewedSpeechCue(cue)).not.toThrow()
    expect(() => assertReviewedSpeechCue({ ...cue, attributions: [
      { marker: 'Clerk:', actorId: 'clerk', kind: 'reported' }, cue.attributions![1],
    ] })).toThrow(/must be live/i)
  })
  it('keeps reported words in the reporting witness turn when declared', () => {
    const cue: ReviewedSpeechCue = {
      id: 'reported', sourceText: 'Venn told me, “Seventy-one waits.”',
      turns: [turn({
        id: 'reported__1', actorId: 'peli-dorn', text: 'Venn told me, “Seventy-one waits.”',
        speechMode: 'reported-testimony', legalAction: 'answer',
        quotedSpans: [{ start: 14, end: 34, sourceActorId: 'accused', source: 'reported' }],
      })],
      attributions: [{ marker: 'Venn told me', actorId: 'accused', kind: 'reported' }],
    }
    expect(() => assertReviewedSpeechCue(cue)).not.toThrow()
  })
  it('enforces actor authority for pleas, evidence subacts and jury notes', () => {
    expect(() => assertLegalActionAuthority(turn({
      id: 'wrong-plea', actorId: 'clerk', text: 'Not Guilty.', legalAction: 'plea-answer',
    }))).toThrow(/cannot perform plea-answer/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'wrong-direction', actorId: 'clerk', text: 'The law is...', speechMode: 'judicial-direction',
    }))).toThrow(/cannot use judicial-direction/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'attendant-oath', actorId: 'court-officer', text: 'You and each of you affirm.',
      legalAction: 'oath-administered',
    }))).not.toThrow()
    expect(() => assertLegalActionAuthority(turn({
      id: 'associate-oath', actorId: 'clerk', text: 'You and each of you affirm.',
      legalAction: 'oath-administered',
    }))).toThrow(/cannot perform oath-administered/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'foundation', actorId: 'sera-quill', text: 'This is my entry.', legalAction: 'foundation',
    }))).not.toThrow()
    expect(() => assertLegalActionAuthority(turn({
      id: 'admission', actorId: 'judge', text: 'Exhibit admitted.', legalAction: 'admission',
    }))).not.toThrow()
    expect(() => assertLegalActionAuthority(turn({
      id: 'jury-note', actorId: 'edda-rook', text: 'Written jury question.',
      speechMode: 'written-text-read', legalAction: 'jury-note',
    }))).not.toThrow()
    expect(() => assertLegalActionAuthority(turn({
      id: 'wrong-foreperson', actorId: 'niko-hale', text: 'Guilty.', legalAction: 'verdict-return',
    }))).toThrow(/only Foreperson/i)
  })

  it('rejects false display identities and malformed quotation provenance', () => {
    expect(() => assertReviewedSpeechCue({ id: 'drift', sourceText: 'Different words.', turns: [
      turn({ id: 'drift__1', actorId: 'judge', text: 'Court resumes.' }),
    ] })).toThrow(/missing or reordered/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'false-label', actorId: 'accused', displayLabel: 'Clerk', text: 'Not guilty.',
    }))).toThrow(/display label/i)
    expect(() => assertReviewedSpeechCue({
      id: 'bad-span', sourceText: 'I heard "wait".',
      turns: [turn({
        id: 'bad-span__1', actorId: 'peli-dorn', text: 'I heard "wait".',
        quotedSpans: [{ start: 20, end: 24, sourceActorId: 'accused', source: 'reported' }],
      })],
    })).toThrow(/quoted spans/i)
    expect(() => assertReviewedSpeechCue({
      id: 'unowned-recording', sourceText: 'I heard "wait".', turns: [turn({
        id: 'unowned-recording__1', actorId: 'peli-dorn', text: 'I heard "wait".',
        quotedSpans: [{ start: 8, end: 14, source: 'recorded' }],
      })],
    })).toThrow(/source actor/i)
  })

  it('rejects stale declarations and live attributions without a matching turn', () => {
    expect(() => assertReviewedSpeechCue({
      id: 'stale', sourceText: 'Court resumes.',
      turns: [turn({ id: 'stale__1', actorId: 'judge', text: 'Court resumes.' })],
      attributions: [{ marker: 'Venn told me', actorId: 'accused', kind: 'reported' }],
    })).toThrow(/stale attribution/i)
    expect(() => assertReviewedSpeechCue({
      id: 'missing-turn', sourceText: 'Dax: No further objection. Exhibit admitted.',
      turns: [turn({ id: 'missing-turn__1', actorId: 'judge', text: 'Exhibit admitted.' })],
      attributions: [{ marker: 'Dax:', actorId: 'defence-counsel', kind: 'live' }],
    })).toThrow(/no matching turn/i)
  })
})
