import { describe, expect, it } from 'vitest'
import {
  assertLegalActionAuthority,
  assertReviewedSpeechCue,
  COURT_WEEK_ACTORS,
  type ReviewedSpeechCue,
  type SpokenTurn,
} from './speechReview'

const turn = (value: Partial<SpokenTurn> & Pick<SpokenTurn, 'id' | 'actorId' | 'text'>): SpokenTurn => ({
  speechMode: 'live-proceeding', legalAction: 'none', ...value,
})

describe('Court Week reviewed speech contract', () => {
  it('has one stable actor id and one foreperson alias for every reviewed entity', () => {
    expect(new Set(COURT_WEEK_ACTORS.map(({ id }) => id)).size).toBe(COURT_WEEK_ACTORS.length)
    expect(COURT_WEEK_ACTORS.find(({ id }) => id === 'edda-rook')).toMatchObject({
      label: 'Edda Rook', aliases: expect.arrayContaining(['Foreperson Edda Rook']),
    })
  })

  it.each([
    ['plea', 'Mara Venn, how do you plead? The accused answers: Not Guilty.'],
    ['named summary', 'Ari asks about intent. Sola Iven answers that the beacon matters.'],
    ['anonymous summary', 'Someone says that silence proves guilt.'],
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
  })

  it('keeps reported words in the reporting witness turn when declared', () => {
    const cue: ReviewedSpeechCue = {
      id: 'reported', sourceText: 'Venn told me, “Seventy-one waits.”',
      turns: [turn({
        id: 'reported__1', actorId: 'peli-dorn', text: 'Venn told me, “Seventy-one waits.”',
        speechMode: 'reported-testimony', legalAction: 'witness-answer',
      })],
      attributions: [{ marker: 'Venn told me', actorId: 'accused', kind: 'reported' }],
    }
    expect(() => assertReviewedSpeechCue(cue)).not.toThrow()
  })

  it('enforces actor authority for pleas and evidence subacts', () => {
    expect(() => assertLegalActionAuthority(turn({
      id: 'wrong-plea', actorId: 'clerk', text: 'Not Guilty.', legalAction: 'plea-answer',
    }))).toThrow(/cannot perform plea-answer/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'wrong-direction', actorId: 'clerk', text: 'The law is...', speechMode: 'judicial-direction',
    }))).toThrow(/cannot use judicial-direction/i)
    expect(() => assertLegalActionAuthority(turn({
      id: 'foundation', actorId: 'sera-quill', text: 'This is my entry.', legalAction: 'foundation',
    }))).not.toThrow()
    expect(() => assertLegalActionAuthority(turn({
      id: 'admission', actorId: 'judge', text: 'Exhibit admitted.', legalAction: 'admission',
    }))).not.toThrow()
  })

  it('rejects stale declarations and live attributions without a matching turn', () => {
    expect(() => assertReviewedSpeechCue({
      id: 'stale', sourceText: 'Court resumes.',
      turns: [turn({ id: 'stale__1', actorId: 'judge', text: 'Court resumes.' })],
      attributions: [{ marker: 'Venn told me', actorId: 'accused', kind: 'reported' }],
    })).toThrow(/stale attribution/i)
    expect(() => assertReviewedSpeechCue({
      id: 'missing-turn', sourceText: 'Dax: No further objection.',
      turns: [turn({ id: 'missing-turn__1', actorId: 'judge', text: 'Exhibit admitted.' })],
      attributions: [{ marker: 'Dax:', actorId: 'defence-counsel', kind: 'live' }],
    })).toThrow(/no matching turn/i)
  })
})
