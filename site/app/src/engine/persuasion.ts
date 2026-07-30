import type { Theme } from '../lib/v2/caseSchema'
import type { JurorProfile, JurorTraits } from './jurorProfile'

/**
 * The persuasion layer — how an argument lands on a *person*.
 *
 * The deliberation engine already models what an argument is worth (a beat's
 * weight, a juror's theme weight, an authored reaction rule). What it did not
 * model is the part a real jury room runs on: whether this particular juror is
 * inclined to hear it from you at all. A holdout who wants a source is not
 * reached by asserting harder; a juror you have pressed twice already stops
 * listening; conceding a point buys credit that a fourth flat assertion does
 * not.
 *
 * So the player now chooses a *technique* (which move) as well as a direction
 * (which side the point cuts for). The move is scored against the juror's
 * derived traits to produce a multiplier on the authored reaction, a rapport
 * change, and a reception label.
 *
 * Two invariants shape the output deliberately:
 *
 *  - Pure and RNG-free. The same appeal against the same relation always
 *    produces the same reception, so the room stays replayable (v3 §9 I-8).
 *  - Reception describes *engagement*, never agreement. Seat leanings and
 *    tallies stay sealed until the judge reads the result, so a juror can read
 *    as "leaning in" without revealing which way they are leaning.
 */

export type PlayerMove =
  /** State plainly that this point proves (or fails to prove) the issue. */
  | 'assert'
  /** Grant the fact, attack the leap the room is making from it. */
  | 'challenge_inference'
  /** Offer an explanation that fits the same fact just as well. */
  | 'raise_alternative'
  /** Tie this recollection to a second one and argue them together. */
  | 'connect_evidence'
  /** Acknowledge what a juror got right, then separate it from this point. */
  | 'distinguish'
  /** Ask a juror to say what their view actually rests on. */
  | 'ask_reason'
  /** Hold the room to the judge's direction. */
  | 'apply_direction'

export const PLAYER_MOVES: readonly PlayerMove[] = [
  'assert',
  'challenge_inference',
  'raise_alternative',
  'connect_evidence',
  'distinguish',
  'ask_reason',
  'apply_direction',
]

/** Which side the player says the point cuts for; 'U' asks the room to test it. */
export type PlayerClaim = 'G' | 'NG' | 'U'

export interface Appeal {
  move: PlayerMove
  beatId: string
  /** Themes of the beat being argued — used for the "this is their subject" read. */
  beatTags: readonly Theme[]
  /** Second recollection for `connect_evidence`; ignored by other moves. */
  supportBeatId?: string
  /** Addressed to one juror rather than the whole room. */
  targetJurorId?: string
}

export type Reception = 'open' | 'listening' | 'guarded' | 'resistant' | 'shut'

export interface JurorReception {
  jurorId: string
  reception: Reception
  /** Multiplier applied to the authored reaction rule's step size. */
  multiplier: number
  rapport: number
  rapportDelta: number
  /** Body-language read shown to the player — never a leaning or a tally. */
  tell: string
  /** This beat sits on a theme the juror weighs heavily. */
  ownSubject: boolean
  /** This beat sits on a theme the juror discounts. */
  discounts: boolean
  /** The move confronted a juror already braced against being pushed. */
  backfired: boolean
}

export interface JurorRelation {
  /** −3 (you have lost them) … +3 (they are with you as a person). */
  rapport: number
  /** 0..100 attention left for re-litigating points with this juror. */
  patience: number
  /** How many times you have addressed this juror directly. */
  pressed: number
  /** Beat ids you have already put to this juror. */
  heard: string[]
}

export interface PersuasionState {
  byJuror: Record<string, JurorRelation>
}

interface MoveSpec {
  /** Trait sensitivities; a trait at 1.0 contributes its full weight. */
  affinity: Partial<Record<keyof JurorTraits, number>>
  /** Baseline rapport change when the move is put to this juror. */
  rapport: number
  /** Puts the juror on the spot rather than the evidence. */
  confrontational: boolean
  /** Pushes no position — it only invites an answer. */
  invitation: boolean
  /** Needs a second, thematically linked recollection to be well formed. */
  needsSupport: boolean
}

const MOVES: Record<PlayerMove, MoveSpec> = {
  assert: {
    affinity: { skepticism: -0.35, agreeableness: 0.3 },
    rapport: 0,
    confrontational: false,
    invitation: false,
    needsSupport: false,
  },
  challenge_inference: {
    affinity: { skepticism: 0.45, closure: -0.2 },
    rapport: 0.2,
    confrontational: true,
    invitation: false,
    needsSupport: false,
  },
  raise_alternative: {
    affinity: { closure: -0.35, skepticism: 0.25 },
    rapport: 0.1,
    confrontational: false,
    invitation: false,
    needsSupport: false,
  },
  connect_evidence: {
    affinity: { skepticism: 0.4, deference: 0.15 },
    rapport: 0.3,
    confrontational: false,
    invitation: false,
    needsSupport: true,
  },
  distinguish: {
    // Conceding what they got right is what reaches a juror braced for a fight.
    affinity: { reactance: 0.3, agreeableness: 0.2 },
    rapport: 0.7,
    confrontational: false,
    invitation: false,
    needsSupport: false,
  },
  ask_reason: {
    affinity: {},
    rapport: 1,
    confrontational: false,
    invitation: true,
    needsSupport: false,
  },
  apply_direction: {
    affinity: { deference: 0.5, skepticism: 0.15 },
    rapport: 0.4,
    confrontational: false,
    invitation: false,
    needsSupport: false,
  },
}

/** Diminishing returns for putting the same recollection to a juror again. */
const REPEAT_FALLOFF = [1, 0.6, 0.35, 0.2] as const
const RAPPORT_MIN = -3
const RAPPORT_MAX = 3
const PATIENCE_START = 100
/** Every appeal costs the room a little attention; the addressee more. */
const PATIENCE_PER_APPEAL = 8
const PATIENCE_PER_PRESS = 14
const PATIENCE_LOW = 35
const PATIENCE_SPENT = 10

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value))
const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Body-language reads, keyed by reception and the juror's authored register.
 * Fixed copy, no generation at runtime, and deliberately silent about which
 * way anyone is leaning. Written without gendered pronouns so one table serves
 * every juror.
 */
const TELLS: Record<Reception, Record<JurorProfile['register'], string>> = {
  open: {
    plain: 'turns right around to face you',
    formal: 'sets down their pen and looks up',
    blunt: 'stops mid-sentence and hears you out',
    hesitant: 'nods, twice, and finally speaks up',
  },
  listening: {
    plain: 'leans in a little',
    formal: 'makes a short note',
    blunt: 'grunts, but is following',
    hesitant: 'glances up and keeps listening',
  },
  guarded: {
    plain: 'listens, but is not moving yet',
    formal: 'waits for you to name the source',
    blunt: 'is unimpressed so far',
    hesitant: 'looks unsure whether to answer',
  },
  resistant: {
    plain: 'shakes their head slightly',
    formal: 'sets that aside as unproven',
    blunt: 'talks straight over the point',
    hesitant: 'shrinks back from the exchange',
  },
  shut: {
    plain: 'folds their arms and looks away',
    formal: 'declines to revisit it',
    blunt: 'has heard enough from you',
    hesitant: 'goes quiet and stays quiet',
  },
}

export function startPersuasion(
  jurorIds: readonly string[],
): PersuasionState {
  const byJuror: Record<string, JurorRelation> = {}
  for (const id of jurorIds) {
    byJuror[id] = { rapport: 0, patience: PATIENCE_START, pressed: 0, heard: [] }
  }
  return { byJuror }
}

export function relationFor(
  state: PersuasionState,
  jurorId: string,
): JurorRelation {
  return (
    state.byJuror[jurorId] ??= {
      rapport: 0,
      patience: PATIENCE_START,
      pressed: 0,
      heard: [],
    }
  )
}

function centred(trait: number): number {
  // 0.5 is neutral: a trait at 1.0 applies the full affinity weight, a trait
  // at 0 applies its negation.
  return (trait - 0.5) * 2
}

function receptionFor(multiplier: number, backfired: boolean): Reception {
  if (backfired) return 'shut'
  if (multiplier >= 1.35) return 'open'
  if (multiplier >= 1.05) return 'listening'
  if (multiplier >= 0.75) return 'guarded'
  return 'resistant'
}

/** Score one appeal against one juror. Pure — the caller commits the change. */
export function scoreAppeal(
  profile: JurorProfile,
  relation: JurorRelation,
  appeal: Appeal,
  options: { supportResolved?: boolean } = {},
): JurorReception {
  const spec = MOVES[appeal.move]
  const targeted = appeal.targetJurorId === profile.id
  const { traits } = profile

  let multiplier = 1
  for (const [trait, weight] of Object.entries(spec.affinity) as [
    keyof JurorTraits,
    number,
  ][]) {
    multiplier += weight * centred(traits[trait])
  }

  // A juror braced against being pushed hardens when put on the spot rather
  // than argued to. This is the move that costs you the room.
  const backfired =
    targeted
    && spec.confrontational
    && traits.reactance > 0.55
    && traits.conviction > 0.5
  if (backfired) multiplier *= 0.5

  const repeats = relation.heard.filter((id) => id === appeal.beatId).length
  multiplier *= REPEAT_FALLOFF[Math.min(repeats, REPEAT_FALLOFF.length - 1)]

  multiplier *= 1 + 0.1 * relation.rapport

  if (relation.patience <= PATIENCE_SPENT) multiplier *= 0.45
  else if (relation.patience < PATIENCE_LOW) multiplier *= 0.75

  if (targeted && relation.pressed >= 2) multiplier *= 0.85

  // A move that needs a second recollection and does not have one is just an
  // assertion wearing a better name.
  if (spec.needsSupport && !options.supportResolved) multiplier *= 0.7

  // An invitation pushes no position at all; it buys standing to be heard.
  if (spec.invitation) multiplier = 0

  let rapportDelta = spec.rapport * (targeted ? 1 : 0.5)
  if (backfired) rapportDelta -= 1
  if (targeted && relation.pressed >= 2) rapportDelta -= 0.5
  if (repeats > 0 && !spec.invitation) rapportDelta -= 0.25 * repeats

  const nextRapport = clamp(
    relation.rapport + rapportDelta,
    RAPPORT_MIN,
    RAPPORT_MAX,
  )
  const effective = round2(clamp(multiplier, 0, 2.5))
  const reception = spec.invitation
    ? (backfired ? 'shut' : nextRapport > relation.rapport ? 'open' : 'listening')
    : receptionFor(effective, backfired)

  return {
    jurorId: profile.id,
    reception,
    multiplier: effective,
    rapport: round2(nextRapport),
    rapportDelta: round2(nextRapport - relation.rapport),
    tell: TELLS[reception][profile.register],
    ownSubject: appeal.beatTags.some((tag) => profile.caresAbout.includes(tag)),
    discounts: appeal.beatTags.some((tag) => profile.wary.includes(tag)),
    backfired,
  }
}

/**
 * Score an appeal against every juror and commit the relationship changes.
 * Returns one reception per juror, in seat order, for the room read-out.
 */
export function applyAppeal(
  state: PersuasionState,
  profiles: readonly JurorProfile[],
  appeal: Appeal,
  options: { supportResolved?: boolean } = {},
): JurorReception[] {
  const ordered = [...profiles].sort((a, b) => a.seat - b.seat)
  const receptions = ordered.map((profile) => {
    const relation = relationFor(state, profile.id)
    const reception = scoreAppeal(profile, relation, appeal, options)
    const targeted = appeal.targetJurorId === profile.id

    relation.rapport = reception.rapport
    relation.heard = [...relation.heard, appeal.beatId]
    if (targeted) relation.pressed += 1
    // Asking a juror to explain themselves restores attention rather than
    // spending it — being invited to speak is not being talked at.
    const patienceCost = MOVES[appeal.move].invitation
      ? -PATIENCE_PER_APPEAL
      : targeted
        ? PATIENCE_PER_PRESS
        : PATIENCE_PER_APPEAL
    relation.patience = clamp(relation.patience - patienceCost, 0, PATIENCE_START)
    return reception
  })
  return receptions
}

/**
 * One honest sentence about how the last exchange went. Counts engagement
 * only, so it never leaks a leaning or a tally.
 */
export function roomReadout(receptions: readonly JurorReception[]): string {
  const count = (reception: Reception) =>
    receptions.filter((item) => item.reception === reception).length
  const open = count('open')
  const listening = count('listening')
  const resistant = count('resistant') + count('shut')

  const parts: string[] = []
  const jurors = (n: number) => (n === 1 ? '1 juror' : `${n} jurors`)
  if (open > 0) parts.push(`${jurors(open)} turned toward you`)
  if (listening > 0) parts.push(`${jurors(listening)} stayed with it`)
  if (resistant > 0) parts.push(`${jurors(resistant)} closed off`)
  if (parts.length === 0) return 'The room heard it and moved on.'
  return `${parts.join(' · ')}.`
}

/** Plain-English label for a move, for the composer and the transcript. */
export const MOVE_LABEL: Record<PlayerMove, string> = {
  assert: 'Put the point plainly',
  challenge_inference: 'Grant the fact, attack the leap',
  raise_alternative: 'Offer an innocent explanation',
  connect_evidence: 'Tie it to a second recollection',
  distinguish: 'Concede their point, then separate it',
  ask_reason: 'Ask what their view rests on',
  apply_direction: 'Hold the room to the direction',
}

/** What the move does, in the player's terms — shown on the composer card. */
export const MOVE_HINT: Record<PlayerMove, string> = {
  assert: 'Direct and quick. Works on jurors who move with the room, wasted on the ones who want a source.',
  challenge_inference: 'Accept what the witness said and attack what the room inferred from it. Reaches sceptics; braced jurors take it personally.',
  raise_alternative: 'Give the same fact a second reading. Lands hardest on jurors in no hurry to finish.',
  connect_evidence: 'Argue two recollections as one chain. Needs a genuine second point sharing a theme.',
  distinguish: 'Give a juror the part they were right about before you separate it. Buys standing with anyone dug in.',
  ask_reason: 'Push no position. Ask a juror to name what their view rests on, and earn the right to answer it.',
  apply_direction: 'Return the room to the judge’s direction. Strongest on the jurors who follow the bench.',
}

export const RECEPTION_LABEL: Record<Reception, string> = {
  open: 'Turned toward you',
  listening: 'Still with it',
  guarded: 'Not moving yet',
  resistant: 'Pushing back',
  shut: 'Closed off',
}
