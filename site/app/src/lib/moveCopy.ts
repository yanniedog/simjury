import type { PlayerMove, Reception } from '../engine/persuasion'

/**
 * Player-facing copy for deliberation techniques and how they were received.
 *
 * This lives in `lib` rather than the engine so `engine/persuasion.ts` stays a
 * pure scoring module with no presentation concerns. Fixed, reviewed copy — no
 * runtime generation — and the reception labels are deliberately about
 * engagement, never agreement, so they cannot leak a juror's leaning.
 */

export const MOVE_LABEL: Record<PlayerMove, string> = {
  assert: 'Put the point plainly',
  challenge_inference: 'Grant the fact, attack the leap',
  raise_alternative: 'Offer an innocent explanation',
  connect_evidence: 'Tie it to a second recollection',
  distinguish: 'Concede their point, then separate it',
  ask_reason: 'Ask what their view rests on',
  apply_direction: 'Hold the room to the direction',
}

/** What the technique does, in the player's terms — shown on the composer card. */
export const MOVE_HINT: Record<PlayerMove, string> = {
  assert:
    'Direct and quick. Works on jurors who move with the room, wasted on the ones who want a source.',
  challenge_inference:
    'Accept what the witness said and attack what the room inferred from it. Reaches sceptics; a juror already braced may take it personally.',
  raise_alternative:
    'Give the same fact a second reading. Lands hardest on jurors in no hurry to finish.',
  connect_evidence:
    'Argue two recollections as one chain. Needs a genuine second point sharing a theme.',
  distinguish:
    'Give a juror the part they were right about before you separate it. Buys standing with anyone dug in.',
  ask_reason:
    'Push no position. Ask a juror to name what their view rests on, and earn the right to answer it.',
  apply_direction:
    'Return the room to the judge’s direction. Strongest on the jurors who follow the bench.',
}

export const RECEPTION_LABEL: Record<Reception, string> = {
  open: 'Turned toward you',
  listening: 'Still with it',
  guarded: 'Not moving yet',
  resistant: 'Pushing back',
  shut: 'Closed off',
}

/** Techniques that carry no direction — the claim control is meaningless. */
const DIRECTIONLESS: readonly PlayerMove[] = ['ask_reason', 'apply_direction']

const EVIDENCE_MOVES: readonly PlayerMove[] = [
  'assert',
  'challenge_inference',
  'raise_alternative',
  'connect_evidence',
  'distinguish',
  'ask_reason',
]
const DIRECTION_MOVES: readonly PlayerMove[] = ['apply_direction', 'ask_reason']

/**
 * Which techniques a beat can carry. Arguing a legal direction and arguing a
 * witness are different acts, and the engine already rejects the wrong one, so
 * the composer must not offer it.
 */
export function movesForBeatKind(kind: string): readonly PlayerMove[] {
  return kind === 'direction' ? DIRECTION_MOVES : EVIDENCE_MOVES
}

export function claimApplies(move: PlayerMove): boolean {
  return !DIRECTIONLESS.includes(move)
}
