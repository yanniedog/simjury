import type { Theme } from '../lib/v2/caseSchema'
import type { JurorProfile, JurorTraits } from './jurorProfile'

/**
 * Pure persuasion scoring: player move × juror traits → reception, rapport,
 * and a reaction multiplier. RNG-free; reception is engagement, never leaning.
 */

export type PlayerMove =
  | 'assert'
  | 'challenge_inference'
  | 'raise_alternative'
  | 'connect_evidence'
  | 'distinguish'
  | 'ask_reason'
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

export type PlayerClaim = 'G' | 'NG' | 'U'

export interface Appeal {
  move: PlayerMove
  beatId: string
  beatTags: readonly Theme[]
  supportBeatId?: string
  targetJurorId?: string
}

export type Reception = 'open' | 'listening' | 'guarded' | 'resistant' | 'shut'

export interface JurorReception {
  jurorId: string
  reception: Reception
  multiplier: number
  rapport: number
  rapportDelta: number
  tell: string
  ownSubject: boolean
  discounts: boolean
  backfired: boolean
}

export interface JurorRelation {
  rapport: number
  patience: number
  pressed: number
  heard: string[]
}

export interface PersuasionState {
  byJuror: Record<string, JurorRelation>
}

interface MoveSpec {
  affinity: Partial<Record<keyof JurorTraits, number>>
  rapport: number
  confrontational: boolean
  invitation: boolean
  needsSupport: boolean
}

const MOVES: Record<PlayerMove, MoveSpec> = {
  assert: { affinity: { skepticism: -0.35, agreeableness: 0.3 }, rapport: 0, confrontational: false, invitation: false, needsSupport: false },
  challenge_inference: { affinity: { skepticism: 0.45, closure: -0.2 }, rapport: 0.2, confrontational: true, invitation: false, needsSupport: false },
  raise_alternative: { affinity: { closure: -0.35, skepticism: 0.25 }, rapport: 0.1, confrontational: false, invitation: false, needsSupport: false },
  connect_evidence: { affinity: { skepticism: 0.4, deference: 0.15 }, rapport: 0.3, confrontational: false, invitation: false, needsSupport: true },
  distinguish: { affinity: { reactance: 0.3, agreeableness: 0.2 }, rapport: 0.7, confrontational: false, invitation: false, needsSupport: false },
  ask_reason: { affinity: {}, rapport: 1, confrontational: false, invitation: true, needsSupport: false },
  apply_direction: { affinity: { deference: 0.5, skepticism: 0.15 }, rapport: 0.4, confrontational: false, invitation: false, needsSupport: false },
}

const REPEAT_FALLOFF = [1, 0.6, 0.35, 0.2] as const
const RAPPORT_MIN = -3
const RAPPORT_MAX = 3
const PATIENCE_START = 100
const PATIENCE_PER_APPEAL = 8
const PATIENCE_PER_PRESS = 14
const PATIENCE_LOW = 35
const PATIENCE_SPENT = 10

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))
const round2 = (value: number) => Math.round(value * 100) / 100

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

export function startPersuasion(jurorIds: readonly string[]): PersuasionState {
  const byJuror: Record<string, JurorRelation> = {}
  for (const id of jurorIds) {
    byJuror[id] = { rapport: 0, patience: PATIENCE_START, pressed: 0, heard: [] }
  }
  return { byJuror }
}

export function relationFor(state: PersuasionState, jurorId: string): JurorRelation {
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
  return (trait - 0.5) * 2
}

function receptionFor(multiplier: number, backfired: boolean): Reception {
  if (backfired) return 'shut'
  if (multiplier >= 1.35) return 'open'
  if (multiplier >= 1.05) return 'listening'
  if (multiplier >= 0.75) return 'guarded'
  return 'resistant'
}

function invitationApplies(spec: MoveSpec, appeal: Appeal, targeted: boolean): boolean {
  return spec.invitation && (!appeal.targetJurorId || targeted)
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
  const invite = invitationApplies(spec, appeal, targeted)

  let multiplier = 1
  for (const [trait, weight] of Object.entries(spec.affinity) as [keyof JurorTraits, number][]) {
    multiplier += weight * centred(traits[trait])
  }

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

  // Credit needs the appeal's own supportBeatId; a bare flag cannot invent one.
  const supportOk = Boolean(appeal.supportBeatId) && options.supportResolved !== false
  if (spec.needsSupport && !supportOk) multiplier *= 0.7
  // Invitations never push a position — not even for bystanders overhearing
  // a targeted ask. Rapport/open tells stay scoped via `invite` below.
  if (spec.invitation) multiplier = 0

  let rapportDelta = invite
    ? spec.rapport
    : spec.invitation && appeal.targetJurorId
      ? 0
      : spec.rapport * (targeted ? 1 : 0.5)
  if (backfired) rapportDelta -= 1
  if (targeted && relation.pressed >= 2) rapportDelta -= 0.5
  if (repeats > 0 && !invite) rapportDelta -= 0.25 * repeats

  const nextRapport = clamp(relation.rapport + rapportDelta, RAPPORT_MIN, RAPPORT_MAX)
  const effective = round2(clamp(multiplier, 0, 2.5))
  const reception = invite
    ? (backfired ? 'shut' : nextRapport > relation.rapport ? 'open' : 'listening')
    : spec.invitation && appeal.targetJurorId && !targeted
      ? 'listening'
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

/** Score every juror and commit relationship changes, in seat order. */
export function applyAppeal(
  state: PersuasionState,
  profiles: readonly JurorProfile[],
  appeal: Appeal,
  options: { supportResolved?: boolean } = {},
): JurorReception[] {
  const ordered = [...profiles].sort((a, b) => a.seat - b.seat)
  return ordered.map((profile) => {
    const relation = relationFor(state, profile.id)
    const reception = scoreAppeal(profile, relation, appeal, options)
    const targeted = appeal.targetJurorId === profile.id
    const invite = invitationApplies(MOVES[appeal.move], appeal, targeted)

    relation.rapport = reception.rapport
    // Invitations earn the right to answer; they must not consume repeat budget.
    if (!invite) relation.heard = [...relation.heard, appeal.beatId]
    if (targeted) relation.pressed += 1

    // Positive delta restores attention; negative spends it.
    const patienceDelta = invite
      ? PATIENCE_PER_APPEAL
      : MOVES[appeal.move].invitation && appeal.targetJurorId && !targeted
        ? 0
        : targeted
          ? -PATIENCE_PER_PRESS
          : -PATIENCE_PER_APPEAL
    relation.patience = clamp(relation.patience + patienceDelta, 0, PATIENCE_START)
    return reception
  })
}

/** Engagement-only room summary — never leaks a leaning or tally. */
export function roomReadout(receptions: readonly JurorReception[]): string {
  const count = (reception: Reception) =>
    receptions.filter((item) => item.reception === reception).length
  const open = count('open')
  const listening = count('listening')
  const guarded = count('guarded')
  const resistant = count('resistant') + count('shut')
  const jurors = (n: number) => (n === 1 ? '1 juror' : `${n} jurors`)
  const parts: string[] = []
  if (open > 0) parts.push(`${jurors(open)} turned toward you`)
  if (listening > 0) parts.push(`${jurors(listening)} stayed with it`)
  if (guarded > 0) parts.push(`${jurors(guarded)} not moving yet`)
  if (resistant > 0) parts.push(`${jurors(resistant)} closed off`)
  if (parts.length === 0) return 'The room heard it and moved on.'
  return `${parts.join(' · ')}.`
}

/** Composer/UI copy lives in the UI wiring follow-up; scoring stays label-free here. */
export const MOVE_LABEL: Record<PlayerMove, string> = {
  assert: 'Put the point plainly',
  challenge_inference: 'Grant the fact, attack the leap',
  raise_alternative: 'Offer an innocent explanation',
  connect_evidence: 'Tie it to a second recollection',
  distinguish: 'Concede their point, then separate it',
  ask_reason: 'Ask what their view rests on',
  apply_direction: 'Hold the room to the direction',
}

export const RECEPTION_LABEL: Record<Reception, string> = {
  open: 'Turned toward you',
  listening: 'Still with it',
  guarded: 'Not moving yet',
  resistant: 'Pushing back',
  shut: 'Closed off',
}
