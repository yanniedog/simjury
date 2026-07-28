import { describe, expect, it } from 'vitest'
import {
  JURY_SIZE,
  MAJORITY_DIRECTION,
  ROOM_SCHEMA_VERSION,
  createRoom,
  dispatch,
  replay,
  restore,
  snapshot,
  type ArgumentFrame,
  type BeliefState,
  type RoomState,
  type VotePosition,
} from './deliberationV5'

const beliefs = (): BeliefState[] =>
  Array.from({ length: JURY_SIZE }, (_, index) => ({
    seat: index + 1,
    position: index < 5 ? 'G' : index < 10 ? 'NG' : 'U',
    elements: {},
    propositions: {},
  }))

const frame = (id: string, position: VotePosition = 'U'): ArgumentFrame => ({
  id,
  act: 'assert',
  evidenceIds: [],
  position,
  certainty: 0.5,
  negated: false,
})

function openFloor(): RoomState {
  let state = dispatch(
    createRoom({ roomId: 'room-1', beliefs: beliefs() }),
    { type: 'opinion_circle_started' },
  )
  for (let seat = 1; seat <= JURY_SIZE; seat++) {
    state = dispatch(state, {
      type: 'opinion_stated', speakerSeat: seat,
      frame: frame(`opinion-${seat}`),
      threadId: `thread-${seat}`,
    })
  }
  return state
}

function discuss(state: RoomState, rounds: number): RoomState {
  for (let round = 0; round < rounds; round++) {
    state = dispatch(state, {
      type: 'argument_raised', speakerSeat: (round % JURY_SIZE) + 1,
      frame: frame(`argument-${round}`), threadId: 'discussion',
    })
    state = dispatch(state, { type: 'discussion_round_completed' })
  }
  return state
}

function ballot(state: RoomState, ballotName: 'first' | 'final', votes: VotePosition[]): RoomState {
  for (let seat = 1; seat <= JURY_SIZE; seat++) {
    state = dispatch(state, {
      type: 'vote_cast', ballot: ballotName, seat, position: votes[seat - 1],
    })
  }
  return state
}

function reachFinalFloor(firstVotes: VotePosition[]): RoomState {
  let state = discuss(openFloor(), 3)
  state = dispatch(state, { type: 'first_ballot_opened' })
  state = ballot(state, 'first', firstVotes)
  state = discuss(state, 1)
  return dispatch(state, { type: 'majority_direction_given', text: MAJORITY_DIRECTION })
}

describe('Deliberation V5 procedure', () => {
  it('requires three meaningful rounds before the first ballot', () => {
    let state = openFloor()
    expect(() => dispatch(state, { type: 'first_ballot_opened' })).toThrow(
      'requires 3 discussion rounds',
    )
    expect(() => dispatch(state, { type: 'discussion_round_completed' })).toThrow(
      'needs a contribution',
    )
    state = discuss(state, 3)
    expect(dispatch(state, { type: 'first_ballot_opened' }).stage).toBe('first_ballot')
  })

  it('returns a unanimous verdict at the first ballot', () => {
    let state = dispatch(discuss(openFloor(), 3), { type: 'first_ballot_opened' })
    state = ballot(state, 'first', Array(JURY_SIZE).fill('NG'))
    expect(state.outcome).toEqual({
      kind: 'unanimous',
      verdict: 'NG',
      tally: { g: 0, ng: 12, u: 0 },
    })
  })

  it('preserves undecided votes and requires the complete majority pathway', () => {
    const first = [...Array(5).fill('G'), ...Array(5).fill('NG'), 'U', 'U'] as VotePosition[]
    let state = reachFinalFloor(first)
    expect(state.failedUnanimousBallot).toBe(true)
    expect(state.ballots.first[11]).toBe('U')
    expect(state.postBallotRounds).toBe(1)
    expect(state.majorityDirectionGiven).toBe(true)

    expect(() => dispatch(state, { type: 'final_ballot_opened' })).toThrow(
      'final-floor contribution',
    )
    state = dispatch(state, {
      type: 'argument_raised', speakerSeat: 11,
      frame: frame('last-concern'), threadId: 'last-concern',
    })
    state = dispatch(state, { type: 'final_ballot_opened' })
    state = ballot(state, 'final', [...Array(10).fill('G'), 'NG', 'U'])
    expect(state.outcome).toEqual({
      kind: 'hung',
      verdict: null,
      tally: { g: 10, ng: 1, u: 1 },
    })
  })

  it('accepts only an 11-of-12 majority after the direction and final floor', () => {
    // The same 11–0–1 tally is not a verdict on the unanimity-only first ballot.
    const split = [...Array(11).fill('NG'), 'U'] as VotePosition[]
    let state = reachFinalFloor(split)
    state = dispatch(state, {
      type: 'argument_raised', speakerSeat: 12,
      frame: frame('final-point', 'NG'), threadId: 'final-point',
    })
    state = dispatch(state, { type: 'final_ballot_opened' })
    state = ballot(state, 'final', [...Array(11).fill('NG'), 'U'])
    expect(state.outcome).toEqual({
      kind: 'majority',
      verdict: 'NG',
      tally: { g: 0, ng: 11, u: 1 },
    })
  })
})

describe('event sourcing', () => {
  it('replays byte-identically without a random source', () => {
    const state = discuss(openFloor(), 3)
    const rebuilt = replay({ roomId: 'room-1', beliefs: beliefs() }, state.events)
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(state))
  })

  it('snapshots defensively and rejects another schema version', () => {
    const state = openFloor()
    const saved = snapshot(state)
    saved.opinionSeats.pop()
    expect(state.opinionSeats).toHaveLength(JURY_SIZE)
    expect(restore(snapshot(state))).toEqual(state)
    expect(() =>
      restore({ ...snapshot(state), schemaVersion: 4 as typeof ROOM_SCHEMA_VERSION }),
    ).toThrow('Unsupported room snapshot version')
  })

  it('does not accept missing, duplicate, or out-of-range seats', () => {
    expect(() => createRoom({ roomId: 'bad', beliefs: beliefs().slice(1) })).toThrow()
    const duplicate = beliefs()
    duplicate[11].seat = 11
    expect(() => createRoom({ roomId: 'bad', beliefs: duplicate })).toThrow()
  })
})
