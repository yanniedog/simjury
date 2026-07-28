import { describe, expect, it } from 'vitest'
import type { BeliefState } from './deliberationV5'
import {
  planJurorReplies,
  understandContribution,
  type DeliberationLanguagePack,
} from './deliberationLanguageV5'

const pack: DeliberationLanguagePack = {
  caseId: 'dd-test',
  issues: [
    { id: 'knowledge', label: 'Knowledge of the warning', aliases: ['knew about the warning'], elementId: 'intent' },
    { id: 'control', label: 'Control of the room', aliases: ['who was in control'] },
    { id: 'identity', label: 'Identity of the sender', aliases: ['who sent it'] },
  ],
  evidence: [
    { id: 'lock-log', label: 'lock access log', aliases: ['door record'], issueIds: ['control'] },
    { id: 'audio', label: 'hallway recording', aliases: ['audio'], issueIds: ['knowledge'] },
  ],
  propositions: [{
    id: 'warning-ended',
    label: 'the warning had ended',
    aliases: ['warning was over'],
    issueId: 'knowledge',
    position: 'NG',
    evidenceIds: ['audio'],
  }],
  responseMoves: [
    {
      id: 'test-knowledge',
      issueIds: ['knowledge'],
      acts: ['challenge_inference', 'assert'],
      positions: ['NG', 'U'],
      text: 'I follow your point about {issue}. What does {evidence} actually establish?',
    },
    {
      id: 'alternative-control',
      issueIds: ['control'],
      acts: ['raise_alternative'],
      positions: ['NG', 'U'],
      text: 'If {point}, who else could have controlled the room?',
    },
  ],
}

const beliefs: BeliefState[] = Array.from({ length: 12 }, (_, index) => ({
  seat: index + 1,
  position: index < 5 ? 'G' : index < 10 ? 'NG' : 'U',
  elements: { intent: index === 6 ? -0.9 : 0.1, control: index === 2 ? 0.8 : 0 },
  propositions: {},
}))

describe('deterministic contribution understanding', () => {
  it('understands a natural challenge and preserves its legal direction', () => {
    const result = understandContribution(
      "I don't think the hallway audio proves they knew about the warning.",
      pack,
    )
    expect(result.frame).toMatchObject({
      act: 'challenge_inference',
      issueId: 'knowledge',
      evidenceIds: ['audio'],
      position: 'NG',
      negated: true,
    })
    expect(result.needsClarification).toBe(false)
    expect(result.paraphrase).toContain('knowledge')
  })

  it('accepts a unique opinion but asks rather than pretending to understand it', () => {
    const result = understandContribution('The blue curtains change everything for me.', pack)
    expect(result.frame.issueId).toBeUndefined()
    expect(result.frame.id).toMatch(/^player-/)
    expect(result.needsClarification).toBe(true)
    expect(result.clarification).toContain("don't want to put words in your mouth")
    expect(planJurorReplies(result, pack, beliefs)[0]).toMatchObject({ kind: 'clarify' })
  })

  it('recognises alternatives, contractions, and a named target seat', () => {
    const result = understandContribution(
      "What if someone else was in control? The door record can't settle it.",
      pack,
      4,
    )
    expect(result.frame).toMatchObject({
      act: 'raise_alternative',
      targetSeat: 4,
      issueId: 'control',
      evidenceIds: ['lock-log'],
      position: 'U',
    })
  })

  it('distinguishes ordinary pro-guilt wording from a challenge or question', () => {
    expect(understandContribution(
      'The door record proves guilt.',
      pack,
    ).frame.position).toBe('G')
    expect(understandContribution(
      'The door record does not prove guilt.',
      pack,
    ).frame.position).toBe('NG')
    expect(understandContribution(
      'Does the door record prove guilt?',
      pack,
    ).frame.position).toBe('U')
  })

  it('does not confuse a numbered concept with its longer neighbour', () => {
    const numeric = { ...pack, issues: [
      { id: 'issue-1', label: 'Issue concept 1', aliases: ['concern one'] },
      { id: 'issue-12', label: 'Issue concept 12', aliases: ['concern twelve'] },
    ] }
    expect(understandContribution('Issue concept 12 concerns me.', numeric).frame.issueId)
      .toBe('issue-12')
  })
})

describe('relevant juror reply planning', () => {
  it('selects an issue-matched move and the juror most engaged with that issue', () => {
    const result = understandContribution(
      'The hallway recording does not prove knowledge of the warning.',
      pack,
    )
    const replies = planJurorReplies(result, pack, beliefs)
    expect(replies[0]).toMatchObject({ seat: 7, moveId: 'test-knowledge', kind: 'engage' })
    expect(replies[0].text).toContain('Knowledge of the warning')
    expect(replies[0].text).toContain('hallway recording')
  })

  it('avoids recent repetition and falls back to an honest follow-up', () => {
    const result = understandContribution(
      'The hallway recording does not prove knowledge of the warning.',
      pack,
    )
    const replies = planJurorReplies(result, pack, beliefs, ['test-knowledge'])
    expect(replies).toHaveLength(1)
    expect(replies[0].moveId).toBeNull()
    expect(replies[0].text).toContain('Which part')
  })

  it('is byte-for-byte deterministic for the same input and pack', () => {
    const run = () => planJurorReplies(
      understandContribution('Could someone else control the room?', pack),
      pack,
      beliefs,
    )
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})
