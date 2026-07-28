import {
  JURY_SIZE,
  MAJORITY_DIRECTION,
  MAJORITY_THRESHOLD,
  REQUIRED_DISCUSSION_ROUNDS,
} from './juryProcedure'

export const ROOM_SCHEMA_VERSION = 5 as const
export {
  JURY_SIZE,
  MAJORITY_DIRECTION,
  MAJORITY_THRESHOLD,
  REQUIRED_DISCUSSION_ROUNDS,
} from './juryProcedure'

export type VotePosition = 'G' | 'NG' | 'U'
export type RoomStage =
  | 'orientation' | 'opinion_circle' | 'open_floor' | 'first_ballot'
  | 'majority_direction' | 'final_floor' | 'final_ballot' | 'complete'

export type DialogueAct =
  | 'assert' | 'agree' | 'disagree' | 'ask_reason' | 'ask_evidence' | 'ask_element'
  | 'challenge_source' | 'challenge_inference' | 'raise_alternative' | 'connect_evidence'
  | 'distinguish' | 'ask_reconcile' | 'correct_direction' | 'clarify' | 'summarize'
  | 'request_ballot' | 'pass'

export interface ArgumentFrame {
  id: string
  act: DialogueAct
  targetSeat?: number
  issueId?: string
  propositionId?: string
  elementId?: string
  evidenceIds: string[]
  relation?: 'supports' | 'undermines' | 'distinguishes' | 'reconciles'
  position: VotePosition
  certainty: number
  negated: boolean
}

export interface BeliefState {
  seat: number
  position: VotePosition
  elements: Record<string, number>
  propositions: Record<string, number>
}

export interface ConversationThread { id: string; issueId?: string; eventSequences: number[] }

export type RoomEventPayload =
  | { type: 'opinion_circle_started' }
  | { type: 'opinion_stated'; speakerSeat: number; frame: ArgumentFrame; threadId: string }
  | { type: 'argument_raised'; speakerSeat: number; frame: ArgumentFrame; threadId: string }
  | { type: 'discussion_round_completed' }
  | { type: 'first_ballot_opened' }
  | { type: 'vote_cast'; ballot: 'first' | 'final'; seat: number; position: VotePosition }
  | { type: 'majority_direction_given'; text: typeof MAJORITY_DIRECTION }
  | { type: 'final_ballot_opened' }

export type RoomEvent = RoomEventPayload & { sequence: number }

export interface RoomOutcome {
  kind: 'unanimous' | 'majority' | 'hung'
  verdict: Exclude<VotePosition, 'U'> | null
  tally: { g: number; ng: number; u: number }
}

export interface RoomState {
  schemaVersion: typeof ROOM_SCHEMA_VERSION
  roomId: string
  stage: RoomStage
  beliefs: BeliefState[]
  opinionSeats: number[]
  discussionRounds: number
  postBallotRounds: number
  currentRoundContributions: number
  failedUnanimousBallot: boolean
  majorityDirectionGiven: boolean
  ballots: { first: Record<number, VotePosition>; final: Record<number, VotePosition> }
  threads: ConversationThread[]
  events: RoomEvent[]
  outcome: RoomOutcome | null
}

export type RoomSnapshot = RoomState

export interface RoomConfig { roomId: string; beliefs: BeliefState[] }

function clone<T>(value: T): T {
  return structuredClone(value)
}

function assertSeat(seat: number): void {
  if (!Number.isInteger(seat) || seat < 1 || seat > JURY_SIZE) {
    throw new Error(`Seat must be between 1 and ${JURY_SIZE}`)
  }
}

export function createRoom(config: RoomConfig): RoomState {
  const seats = config.beliefs.map((belief) => belief.seat)
  if (
    seats.length !== JURY_SIZE ||
    new Set(seats).size !== JURY_SIZE ||
    seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > JURY_SIZE)
  ) {
    throw new Error(`A room requires exactly ${JURY_SIZE} unique seats`)
  }
  return {
    schemaVersion: ROOM_SCHEMA_VERSION,
    roomId: config.roomId,
    stage: 'orientation',
    beliefs: clone(config.beliefs),
    opinionSeats: [],
    discussionRounds: 0,
    postBallotRounds: 0,
    currentRoundContributions: 0,
    failedUnanimousBallot: false,
    majorityDirectionGiven: false,
    ballots: { first: {}, final: {} },
    threads: [],
    events: [],
    outcome: null,
  }
}

function tally(votes: Record<number, VotePosition>): RoomOutcome['tally'] {
  const values = Object.values(votes)
  return {
    g: values.filter((vote) => vote === 'G').length,
    ng: values.filter((vote) => vote === 'NG').length,
    u: values.filter((vote) => vote === 'U').length,
  }
}

function outcomeFor(
  votes: Record<number, VotePosition>,
  majorityAllowed: boolean,
): RoomOutcome | null {
  if (Object.keys(votes).length !== JURY_SIZE) return null
  const result = tally(votes)
  if (result.g === JURY_SIZE || result.ng === JURY_SIZE) {
    return { kind: 'unanimous', verdict: result.g === JURY_SIZE ? 'G' : 'NG', tally: result }
  }
  if (majorityAllowed && (result.g >= MAJORITY_THRESHOLD || result.ng >= MAJORITY_THRESHOLD)) {
    return { kind: 'majority', verdict: result.g >= MAJORITY_THRESHOLD ? 'G' : 'NG', tally: result }
  }
  return majorityAllowed ? { kind: 'hung', verdict: null, tally: result } : null
}

type ThreadEvent = Extract<RoomEvent, { type: 'opinion_stated' } | { type: 'argument_raised' }>

function addThreadEvent(state: RoomState, event: ThreadEvent): void {
  const thread = state.threads.find(({ id }) => id === event.threadId)
  if (thread) thread.eventSequences.push(event.sequence)
  else {
    state.threads.push({
      id: event.threadId,
      issueId: event.frame.issueId,
      eventSequences: [event.sequence],
    })
  }
}

function applyEvent(previous: RoomState, event: RoomEvent): RoomState {
  const state = clone(previous)
  if (event.sequence !== state.events.length + 1) throw new Error('Invalid event sequence')

  switch (event.type) {
    case 'opinion_circle_started':
      if (state.stage !== 'orientation') throw new Error('Orientation has already ended')
      state.stage = 'opinion_circle'
      break
    case 'opinion_stated':
      if (state.stage !== 'opinion_circle') throw new Error('The opinion circle is not open')
      assertSeat(event.speakerSeat)
      if (event.frame.act === 'pass') throw new Error('An opinion must be substantive')
      if (state.opinionSeats.includes(event.speakerSeat)) throw new Error('Seat already gave an opinion')
      state.opinionSeats.push(event.speakerSeat)
      addThreadEvent(state, event)
      if (state.opinionSeats.length === JURY_SIZE) state.stage = 'open_floor'
      break
    case 'argument_raised':
      if (state.stage !== 'open_floor' && state.stage !== 'final_floor') {
        throw new Error('Arguments may be raised only during an open floor')
      }
      assertSeat(event.speakerSeat)
      if (event.frame.act === 'pass') throw new Error('A discussion contribution cannot be a pass')
      state.currentRoundContributions++
      addThreadEvent(state, event)
      break
    case 'discussion_round_completed':
      if (state.stage !== 'open_floor') throw new Error('There is no open discussion round')
      if (state.currentRoundContributions === 0) throw new Error('A discussion round needs a contribution')
      state.currentRoundContributions = 0
      if (state.failedUnanimousBallot) {
        state.postBallotRounds++
        state.stage = 'majority_direction'
      } else state.discussionRounds++
      break
    case 'first_ballot_opened':
      if (state.stage !== 'open_floor' || state.discussionRounds < REQUIRED_DISCUSSION_ROUNDS) {
        throw new Error(`The first ballot requires ${REQUIRED_DISCUSSION_ROUNDS} discussion rounds`)
      }
      if (state.currentRoundContributions > 0) {
        throw new Error('Complete the pending discussion round before opening the first ballot')
      }
      state.stage = 'first_ballot'
      break
    case 'vote_cast': {
      if (state.stage !== `${event.ballot}_ballot`) throw new Error(`The ${event.ballot} ballot is not open`)
      assertSeat(event.seat)
      const votes = state.ballots[event.ballot]
      if (votes[event.seat]) throw new Error('Seat already voted in this ballot')
      votes[event.seat] = event.position
      const result = outcomeFor(votes, event.ballot === 'final')
      if (result) {
        state.outcome = result
        state.stage = 'complete'
      } else if (event.ballot === 'first' && Object.keys(votes).length === JURY_SIZE) {
        state.failedUnanimousBallot = true
        state.stage = 'open_floor'
      }
      break
    }
    case 'majority_direction_given':
      if (state.stage !== 'majority_direction' || event.text !== MAJORITY_DIRECTION) {
        throw new Error('The neutral majority direction is not available')
      }
      state.majorityDirectionGiven = true
      state.stage = 'final_floor'
      break
    case 'final_ballot_opened':
      if (
        state.stage !== 'final_floor' ||
        !state.majorityDirectionGiven ||
        state.currentRoundContributions === 0
      ) {
        throw new Error('The final ballot requires the direction and a final-floor contribution')
      }
      state.currentRoundContributions = 0
      state.stage = 'final_ballot'
      break
  }
  state.events.push(clone(event))
  return state
}

export function dispatch(state: RoomState, payload: RoomEventPayload): RoomState {
  return applyEvent(state, { ...clone(payload), sequence: state.events.length + 1 } as RoomEvent)
}

export function availableActions(state: RoomState): RoomEventPayload['type'][] {
  switch (state.stage) {
    case 'orientation': return ['opinion_circle_started']
    case 'opinion_circle': return ['opinion_stated']
    case 'open_floor': {
      const actions: RoomEventPayload['type'][] = ['argument_raised']
      if (state.currentRoundContributions > 0) actions.push('discussion_round_completed')
      if (
        !state.failedUnanimousBallot &&
        state.discussionRounds >= REQUIRED_DISCUSSION_ROUNDS &&
        state.currentRoundContributions === 0
      ) {
        actions.push('first_ballot_opened')
      }
      return actions
    }
    case 'first_ballot':
    case 'final_ballot': return ['vote_cast']
    case 'majority_direction': return ['majority_direction_given']
    case 'final_floor':
      return state.currentRoundContributions > 0
        ? ['argument_raised', 'final_ballot_opened']
        : ['argument_raised']
    case 'complete': return []
  }
}

export function canAdvance(
  state: RoomState,
  payload: RoomEventPayload,
): { allowed: boolean; reason?: string } {
  try {
    dispatch(state, payload)
    return { allowed: true }
  } catch (error) {
    return { allowed: false, reason: error instanceof Error ? error.message : 'Invalid transition' }
  }
}

export function replay(config: RoomConfig, events: RoomEvent[]): RoomState {
  return events.reduce(applyEvent, createRoom(config))
}

export function snapshot(state: RoomState): RoomSnapshot {
  return clone(state)
}

export function restore(saved: RoomSnapshot): RoomState {
  if (saved.schemaVersion !== ROOM_SCHEMA_VERSION) throw new Error('Unsupported room snapshot version')
  return clone(saved)
}
