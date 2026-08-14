import { describe, expect, it } from 'vitest'
import {
  courtAdvanceAction,
  courtEventAction,
  interactionOpenAction,
  interactionPrimaryAction,
} from './proceduralActions'

type PrimaryInput = Parameters<typeof interactionPrimaryAction>[0]

function primary(kind: PrimaryInput['kind'], overrides: Partial<Omit<PrimaryInput, 'kind'>> = {}) {
  return interactionPrimaryAction({
    kind,
    replay: false,
    replayEnds: false,
    ballotSealed: false,
    secondBallotWasUnanimous: false,
    prompt: 'Review this step.',
    recordsReasoning: false,
    ...overrides,
  })
}

describe('procedural action labels', () => {
  it('names the legal event that reading mode will open', () => {
    expect(courtEventAction('witness-chief')).toBe('Read the examination')
    expect(courtEventAction('ruling')).toBe('Read the ruling')
    expect(courtEventAction('verdict-return')).toBe('Read the open-court return')
  })

  it('names the contribution that opens at a scene boundary', () => {
    expect(interactionOpenAction({
      kind: 'inspect-exhibit', prompt: 'Inspect the route.', replay: false,
    })).toBe('Inspect the admitted exhibit')
    expect(interactionOpenAction({
      kind: 'choose-focus', prompt: 'Choose oath or affirmation privately.', replay: false,
    })).toBe('Choose oath or affirmation')
    expect(interactionOpenAction({
      kind: 'reasoning', prompt: 'Review the evidence.', replay: true,
    })).toBe('Review this interaction')
  })

  it('derives the next action without duplicating shell fallback copy', () => {
    expect(courtAdvanceAction({
      targetEvent: 'ruling', replay: false, sessionEndAction: 'Finish Tuesday session',
    })).toBe('Read the ruling')
    expect(courtAdvanceAction({
      replay: true, sessionEndAction: 'Complete Court Week',
    })).toBe('End replay')
  })

  it('distinguishes ballot sealing from the procedural step that follows', () => {
    expect(primary('seal-vote')).toBe('Seal provisional ballot')
    expect(primary('seal-vote', { ballotSealed: true })).toBe('Continue toward the anonymous aggregate')
    expect(primary('second-vote', { ballotSealed: true })).toBe('Return to court for direction')
    expect(primary('second-vote', {
      ballotSealed: true, secondBallotWasUnanimous: true,
    })).toBe('Return to court')
  })

  it('names replay, oath, reasoning and jury-note outcomes truthfully', () => {
    expect(primary('reasoning', { replay: true })).toBe('Resume replay')
    expect(primary('reasoning', { replay: true, replayEnds: true })).toBe('End replay')
    expect(primary('reasoning', { recordsReasoning: true })).toBe('Record reasoning contribution')
    expect(primary('reasoning')).toBe('Continue without saving reflection')
    expect(primary('choose-focus', { prompt: 'Choose oath or affirmation privately.' }))
      .toBe('Confirm oath or affirmation')
    expect(primary('jury-note')).toBe('Return to court for overnight separation')
  })
})
