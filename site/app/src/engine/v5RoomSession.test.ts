import { describe, expect, it } from 'vitest'
import type { ClientDeliberationPack } from '../lib/v2/caseBundles'
import { REASONING_MODELS } from './deliberationPackV5'
import {
  contributeToV5Session,
  createV5Session,
  restoreV5Session,
  sealV5Session,
} from './v5RoomSession'

function pack(): ClientDeliberationPack {
  return {
    schema_version: 5,
    case_id: 'dd-0099',
    case_revision: 'dd-0099@1234abcd',
    issues: [{
      id: 'access',
      label: 'Control of the access record',
      aliases: ['access record', 'who controlled access'],
      elementId: 'knowledge',
    }],
    evidence: [{
      id: 'log',
      label: 'Access log',
      aliases: ['door log', 'entry record'],
      issueIds: ['access'],
    }],
    propositions: [{
      id: 'accused-access',
      label: 'The accused controlled access',
      aliases: ['accused used access', 'controlled the door'],
      issueId: 'access',
      position: 'G',
      evidenceIds: ['log'],
    }],
    responseMoves: [{
      id: 'test-access',
      issueIds: ['access'],
      acts: ['assert', 'connect_evidence'],
      positions: ['G', 'NG', 'U'],
      text: 'What does {evidence} establish about {issue}?',
    }],
    reasoning_profiles: REASONING_MODELS.map((reasoning_model, index) => ({
      seat: index + 1,
      reasoning_model,
      display_name: index === 0 ? 'You' : `Juror ${index + 1}`,
      baseline_position: index < 6 ? 'G' : 'NG',
      element_weights: { knowledge: index / 12 },
      change_threshold: 0.3 + index / 30,
      question_style: 'careful',
    })),
  }
}

function discuss(position = 'The access log proves the accused is guilty') {
  const authored = pack()
  let session = createV5Session(authored.case_revision, authored)
  for (let index = 0; index < 3; index++) {
    session = contributeToV5Session(session, position, authored).session
  }
  return { authored, session }
}

describe('V5 player session', () => {
  it('allows at most one clarification before accepting plain language', () => {
    const authored = pack()
    const session = createV5Session(authored.case_revision, authored)
    const first = contributeToV5Session(session, 'The blue curtains matter', authored)
    expect(first.accepted).toBe(false)
    expect(first.session.clarificationUsed).toBe(true)
    expect(first.session.pendingClarification?.question).toContain("don't want to put words")

    const second = contributeToV5Session(first.session, 'I mean the access record', authored)
    expect(second.accepted).toBe(true)
    expect(second.session.pendingClarification).toBeNull()
    expect(second.session.acceptedContributions).toBe(1)
    expect(second.session.transcript.filter(({ kind }) => kind === 'clarification')).toHaveLength(1)
  })

  it('produces deterministic replies and revision-bound resumable snapshots', () => {
    const authored = pack()
    const run = () => contributeToV5Session(
      createV5Session(authored.case_revision, authored),
      'The access log proves the accused is guilty',
      authored,
    ).session
    const first = run()
    expect(JSON.stringify(run())).toBe(JSON.stringify(first))
    expect(restoreV5Session(JSON.parse(JSON.stringify(first)), authored.case_revision)).toEqual(first)
    expect(restoreV5Session(first, 'dd-0099@ffffffff')).toBeNull()
  })

  it('keeps the tally sealed until the player verdict completes the ballot', () => {
    const { session } = discuss()
    expect(session.room.outcome).toBeNull()
    expect(session.transcript.map(({ text }) => text).join(' ')).not.toMatch(/\b\d+\s+guilty\b/i)

    const sealed = sealV5Session(session, 'G')
    expect(sealed.room.stage).toBe('complete')
    expect(sealed.room.outcome).toEqual({
      kind: 'unanimous',
      verdict: 'G',
      tally: { g: 12, ng: 0, u: 0 },
    })
  })

  it('lets the player’s reasoning change the deterministic room result', () => {
    const guilty = sealV5Session(discuss().session, 'G').room.outcome
    const notGuilty = sealV5Session(
      discuss('The access record leaves reasonable doubt and does not prove guilt').session,
      'NG',
    ).room.outcome

    expect(guilty?.verdict).toBe('G')
    expect(notGuilty?.verdict).toBe('NG')
    expect(notGuilty).not.toEqual(guilty)
  })
})
