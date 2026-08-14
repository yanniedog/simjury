import { describe, expect, it } from 'vitest'
import { courtEventAction, interactionOpenAction, interactionPrimaryAction } from './proceduralActions'

describe('procedural action labels', () => {
  it('names the legal event that reading mode will open', () => {
    expect(courtEventAction('witness-chief')).toBe('Read the examination')
    expect(courtEventAction('ruling')).toBe('Read the ruling')
    expect(courtEventAction('verdict-return')).toBe('Read the open-court return')
  })

  it('names the contribution that opens at a scene boundary', () => {
    expect(interactionOpenAction('inspect-exhibit')).toBe('Inspect the admitted exhibit')
    expect(interactionOpenAction('second-vote')).toBe('Open the second private ballot')
  })

  it('distinguishes ballot sealing from the procedural step that follows', () => {
    expect(interactionPrimaryAction({
      kind: 'seal-vote', replay: false, ballotSealed: false, secondBallotWasUnanimous: false,
    })).toBe('Seal provisional ballot')
    expect(interactionPrimaryAction({
      kind: 'seal-vote', replay: false, ballotSealed: true, secondBallotWasUnanimous: false,
    })).toBe('View anonymous aggregate')
    expect(interactionPrimaryAction({
      kind: 'second-vote', replay: false, ballotSealed: true, secondBallotWasUnanimous: false,
    })).toBe('Return to court for direction')
    expect(interactionPrimaryAction({
      kind: 'second-vote', replay: false, ballotSealed: true, secondBallotWasUnanimous: true,
    })).toBe('Return to court')
  })
})
