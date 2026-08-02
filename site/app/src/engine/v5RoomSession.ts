import type { ClientDeliberationPack } from '../lib/v2/caseBundles'
import {
  createRoom,
  dispatch,
  JURY_SIZE,
  MAJORITY_DIRECTION,
  REQUIRED_DISCUSSION_ROUNDS,
  restore,
  snapshot,
  type ArgumentFrame,
  type BeliefState,
  type RoomSnapshot,
  type VotePosition,
} from './deliberationV5'
import {
  planJurorReplies,
  understandContribution,
  type DeliberationLanguagePack,
  type Understanding,
} from './deliberationLanguageV5'

export const V5_SESSION_VERSION = 1 as const

export interface V5TranscriptLine {
  id: string
  kind: 'player' | 'juror' | 'clarification' | 'direction'
  text: string
  seat?: number
}

export interface V5RoomSession {
  schemaVersion: typeof V5_SESSION_VERSION
  caseRevision: string
  room: RoomSnapshot
  acceptedContributions: number
  clarificationUsed: boolean
  pendingClarification: { originalText: string; question: string } | null
  recentMoveIds: string[]
  transcript: V5TranscriptLine[]
}

function languagePack(pack: ClientDeliberationPack): DeliberationLanguagePack {
  return {
    caseId: pack.case_id,
    issues: pack.issues,
    evidence: pack.evidence,
    propositions: pack.propositions,
    responseMoves: pack.responseMoves,
  }
}

function initialBeliefs(pack: ClientDeliberationPack): BeliefState[] {
  return [...pack.reasoning_profiles]
    .sort((a, b) => a.seat - b.seat)
    .map((profile) => ({
      seat: profile.seat,
      position: profile.baseline_position,
      elements: profile.element_weights,
      propositions: {},
    }))
}

function frame(id: string, position: VotePosition, issueId?: string): ArgumentFrame {
  return {
    id,
    act: 'assert',
    issueId,
    evidenceIds: [],
    position,
    certainty: 0.5,
    negated: false,
  }
}

export function createV5Session(
  caseRevision: string,
  pack: ClientDeliberationPack,
): V5RoomSession {
  const beliefs = initialBeliefs(pack)
  let room = dispatch(createRoom({ roomId: caseRevision, beliefs }), {
    type: 'opinion_circle_started',
  })
  for (const belief of beliefs) {
    room = dispatch(room, {
      type: 'opinion_stated',
      speakerSeat: belief.seat,
      frame: frame(`opening-${belief.seat}`, belief.position),
      threadId: `opening-${belief.seat}`,
    })
  }
  return {
    schemaVersion: V5_SESSION_VERSION,
    caseRevision,
    room: snapshot(room),
    acceptedContributions: 0,
    clarificationUsed: false,
    pendingClarification: null,
    recentMoveIds: [],
    transcript: [],
  }
}

function forceUnderstanding(result: Understanding): Understanding {
  return {
    ...result,
    needsClarification: false,
    clarification: null,
    frame: { ...result.frame, certainty: Math.max(0.35, result.frame.certainty) },
  }
}

function updateBeliefs(
  beliefs: BeliefState[],
  understanding: Understanding,
  pack: ClientDeliberationPack,
): BeliefState[] {
  const requested = understanding.frame.position
  if (requested === 'U') return beliefs
  return beliefs.map((belief) => {
    if (belief.seat === 1) return belief
    const profile = pack.reasoning_profiles.find(({ seat }) => seat === belief.seat)
    const elementWeight = understanding.frame.elementId
      ? Math.abs(belief.elements[understanding.frame.elementId] ?? 0)
      : 0
    const strength = Math.min(
      1,
      understanding.frame.certainty +
        understanding.frame.evidenceIds.length * 0.08 +
        elementWeight * 0.2,
    )
    if (!profile || strength < profile.change_threshold) return belief
    return { ...belief, position: requested }
  })
}

export interface ContributionResult {
  session: V5RoomSession
  accepted: boolean
}

export function contributeToV5Session(
  previous: V5RoomSession,
  text: string,
  pack: ClientDeliberationPack,
): ContributionResult {
  if (previous.room.stage !== 'open_floor') {
    throw new Error('The discussion floor is closed')
  }
  if (previous.acceptedContributions >= REQUIRED_DISCUSSION_ROUNDS) {
    throw new Error('The required discussion rounds are complete')
  }
  const clean = text.trim().slice(0, 500)
  if (!clean) throw new Error('Enter a point for the jury to consider')

  const runtime = languagePack(pack)
  const pending = previous.pendingClarification
  let understanding = understandContribution(
    pending ? `${pending.originalText} ${clean}` : clean,
    runtime,
  )
  if (understanding.needsClarification && !previous.clarificationUsed) {
    const question = understanding.clarification ?? 'Which issue do you mean?'
    return {
      accepted: false,
      session: {
        ...previous,
        clarificationUsed: true,
        pendingClarification: { originalText: clean, question },
        transcript: [...previous.transcript, {
          id: `clarification-${previous.transcript.length + 1}`,
          kind: 'clarification',
          text: question,
        }],
      },
    }
  }
  if (understanding.needsClarification) understanding = forceUnderstanding(understanding)

  const replies = planJurorReplies(
    understanding,
    runtime,
    previous.room.beliefs,
    previous.recentMoveIds,
  )
  let room = restore(previous.room)
  room = { ...room, beliefs: updateBeliefs(room.beliefs, understanding, pack) }
  room = dispatch(room, {
    type: 'argument_raised',
    speakerSeat: 1,
    frame: understanding.frame,
    threadId: understanding.frame.issueId ?? understanding.frame.id,
  })
  room = dispatch(room, { type: 'discussion_round_completed' })

  const playerText = pending ? `${pending.originalText} ${clean}` : clean
  const recentMoveIds = [
    ...previous.recentMoveIds,
    ...replies.flatMap(({ moveId }) => moveId ? [moveId] : []),
  ].slice(-8)
  return {
    accepted: true,
    session: {
      ...previous,
      room: snapshot(room),
      acceptedContributions: previous.acceptedContributions + 1,
      pendingClarification: null,
      recentMoveIds,
      transcript: [
        ...previous.transcript,
        { id: `player-${previous.transcript.length + 1}`, kind: 'player', text: playerText, seat: 1 },
        ...replies.map((reply, index) => ({
          id: `juror-${previous.transcript.length + index + 2}`,
          kind: 'juror' as const,
          text: reply.text,
          seat: reply.seat,
        })),
      ],
    },
  }
}

function castBallot(
  room: RoomSnapshot,
  ballot: 'first' | 'final',
  playerPosition: VotePosition,
): RoomSnapshot {
  let next = restore(room)
  for (let seat = 1; seat <= JURY_SIZE; seat++) {
    const position = seat === 1
      ? playerPosition
      : next.beliefs.find((belief) => belief.seat === seat)?.position ?? 'U'
    next = dispatch(next, { type: 'vote_cast', ballot, seat, position })
  }
  return snapshot(next)
}

export function sealV5Session(
  previous: V5RoomSession,
  playerPosition: VotePosition,
): V5RoomSession {
  if (previous.acceptedContributions < REQUIRED_DISCUSSION_ROUNDS) {
    throw new Error(`Discuss ${REQUIRED_DISCUSSION_ROUNDS} points before sealing a verdict`)
  }
  let room = dispatch(restore(previous.room), { type: 'first_ballot_opened' })
  room = restore(castBallot(snapshot(room), 'first', playerPosition))
  const transcript = [...previous.transcript]
  if (!room.outcome) {
    room = dispatch(room, {
      type: 'argument_raised',
      speakerSeat: 1,
      frame: frame('post-ballot-point', playerPosition),
      threadId: 'post-ballot-point',
    })
    room = dispatch(room, { type: 'discussion_round_completed' })
    room = dispatch(room, {
      type: 'majority_direction_given',
      text: MAJORITY_DIRECTION,
    })
    transcript.push({
      id: `direction-${transcript.length + 1}`,
      kind: 'direction',
      text: MAJORITY_DIRECTION,
    })
    room = dispatch(room, {
      type: 'argument_raised',
      speakerSeat: 1,
      frame: frame('final-position', playerPosition),
      threadId: 'final-position',
    })
    room = dispatch(room, { type: 'final_ballot_opened' })
    room = restore(castBallot(snapshot(room), 'final', playerPosition))
  }
  if (!room.outcome) throw new Error('The sealed ballot did not produce an outcome')
  return { ...previous, room: snapshot(room), transcript }
}

export function restoreV5Session(
  value: unknown,
  caseRevision: string,
): V5RoomSession | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<V5RoomSession>
  if (
    candidate.schemaVersion !== V5_SESSION_VERSION ||
    candidate.caseRevision !== caseRevision ||
    !candidate.room ||
    !Number.isInteger(candidate.acceptedContributions) ||
    typeof candidate.clarificationUsed !== 'boolean' ||
    !Array.isArray(candidate.recentMoveIds) ||
    !Array.isArray(candidate.transcript)
  ) return null
  try {
    restore(candidate.room)
    return structuredClone(candidate as V5RoomSession)
  } catch {
    return null
  }
}
