import type {
  DocketBeat,
  DocketCase,
  Juror,
  LineFunction,
  Stance,
} from '../lib/v2/caseSchema'
import { pick, rngFor, type Rng } from './rng'

/**
 * The Daily Docket deliberation engine — v3 spec §9 at daily scale, pure and
 * deterministic. The player locks a verdict first (no anchoring), then plays
 * up to three open rounds against 11 rule-driven jurors:
 *
 *   INITIAL_POSITIONS → OPEN_ROUND ×2 → MID_VOTE → OPEN_ROUND ×1
 *     → FINAL_VOTE → (unanimous | majority ≥10 | HUNG)
 *
 * Same case + same verdict + same actions ⇒ byte-identical event log (the
 * I-8 determinism requirement); different arguments consume the seeded rng
 * differently and the room genuinely diverges. Jurors respond through their
 * authored reaction rules; `vibes`/`drifter` arcs weigh a beat's surface
 * persuasion while everyone else weighs its true weight — so arguing the
 * decisive evidence moves the room, and arguing the traps mostly moves the
 * gullible.
 */

export type PlayerVerdict = 'guilty' | 'not_guilty'

export type PlayerAction =
  | { type: 'argue'; beatId: string; stance: Stance }
  | { type: 'cite_direction'; beatId: string }
  | { type: 'pass' }

export type Phase =
  | 'open_1'
  | 'open_2'
  | 'mid_vote'
  | 'open_3'
  | 'final_vote'
  | 'done'

export interface JurorState {
  id: string
  seat: number
  label: string
  arc: Juror['arc']
  /** −2 committed NG … +2 committed G; 0 undecided. */
  position: number
  confidence: number
}

export interface RoomEvent {
  tick: number
  phase: Phase
  actor: string
  type:
    | 'positions'
    | 'argue'
    | 'cite'
    | 'pass'
    | 'respond'
    | 'drift'
    | 'drift_corrected'
    | 'vote'
    | 'deadlock_direction'
    | 'outcome'
  beatId?: string
  stance?: Stance
  push?: 'guilt' | 'innocence'
  line?: string
  lineFunction?: LineFunction
  delta?: number
  position?: number
  tally?: { g: number; ng: number; u: number }
  detail?: string
}

export interface Outcome {
  kind: 'unanimous' | 'majority' | 'hung'
  verdict: PlayerVerdict | null
  /** Final 12-vote tally, player included. */
  tally: { g: number; ng: number }
  burdenDrift: { occurred: boolean; correctedByPlayer: boolean }
}

export interface DeliberationState {
  caseData: DocketCase
  playerVerdict: PlayerVerdict
  jurors: JurorState[]
  phase: Phase
  tick: number
  log: RoomEvent[]
  rng: Rng
  driftActive: boolean
  driftCorrectedByPlayer: boolean
  outcome: Outcome | null
}

export const SPEAKERS_PER_ROUND = 4
export const MAJORITY_THRESHOLD = 10

/** Per-arc probability of drifting one step toward the room majority per round. */
const PRESSURE: Record<Juror['arc'], number> = {
  vibes: 0.25,
  steady: 0.1,
  principled_holdout: 0.02,
  mind_changer: 0.15,
  drifter: 0.4,
  burden_drifter: 0.2,
  foreperson: 0.1,
}
/** Chance a burden_correct voice fires from the room if the player never cites. */
const ROOM_SELF_CORRECT_P = 0.35

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)

function initialPosition(j: Juror): number {
  if (j.initial.position === 'U') return 0
  const committed = j.initial.confidence >= 70 ? 2 : 1
  return j.initial.position === 'G' ? committed : -committed
}

function tallyOf(jurors: JurorState[]): { g: number; ng: number; u: number } {
  let g = 0
  let ng = 0
  let u = 0
  for (const j of jurors) {
    const s = sign(j.position)
    if (s > 0) g++
    else if (s < 0) ng++
    else u++
  }
  return { g, ng, u }
}

export function startDeliberation(
  caseData: DocketCase,
  playerVerdict: PlayerVerdict,
): DeliberationState {
  const state: DeliberationState = {
    caseData,
    playerVerdict,
    jurors: caseData.jury.jurors.map((j) => ({
      id: j.id,
      seat: j.seat,
      label: j.label,
      arc: j.arc,
      position: initialPosition(j),
      confidence: j.initial.confidence,
    })),
    phase: 'open_1',
    tick: 0,
    log: [],
    rng: rngFor(`${caseData.id}:${playerVerdict}`),
    driftActive: false,
    driftCorrectedByPlayer: false,
    outcome: null,
  }
  emit(state, { actor: 'room', type: 'positions', tally: tallyOf(state.jurors) })
  return state
}

function emit(state: DeliberationState, e: Omit<RoomEvent, 'tick' | 'phase'>): void {
  state.log.push({ tick: state.tick++, phase: state.phase, ...e })
}

function beatById(c: DocketCase, id: string): DocketBeat {
  const beat = c.beats.find((b) => b.id === id)
  if (!beat) throw new Error(`Unknown beat ${id}`)
  return beat
}

function matchRule(j: Juror, beat: DocketBeat, stance: Stance, push: 'guilt' | 'innocence') {
  return j.reaction_rules.find((r) => {
    const themeOk = r.when.theme === 'any' || beat.tags.includes(r.when.theme)
    const stanceOk = r.when.stance === 'any' || r.when.stance === stance
    const directionOk = !r.when.direction || r.when.direction === push
    return themeOk && stanceOk && directionOk
  })
}

function voice(state: DeliberationState, j: Juror, fn: LineFunction): string {
  const options = j.lines[fn]
  if (!options || options.length === 0) return ''
  return pick(state.rng, options)
}

function respond(
  state: DeliberationState,
  juror: Juror,
  beat: DocketBeat,
  stance: Stance,
  push: 'guilt' | 'innocence',
): void {
  const rule = matchRule(juror, beat, stance, push)
  if (!rule) return
  const js = state.jurors.find((s) => s.id === juror.id)!

  // How hard the argument lands: the gullible arcs weigh how the beat feels,
  // everyone else weighs what it is worth; a juror's theme weight amplifies.
  const q =
    juror.arc === 'vibes' || juror.arc === 'drifter'
      ? beat.surface_persuasion
      : beat.true_weight
  const weight = Math.max(
    0,
    ...beat.tags.map((t) => juror.weights[t] ?? 0),
  )
  const raw = Math.abs(rule.effect.delta) * (0.4 + q + 0.2 * weight)
  const steps = rule.effect.delta === 0 ? 0 : Math.min(2, Math.floor(raw + state.rng()))
  const pushSign = push === 'guilt' ? 1 : -1
  const moveSign = pushSign * sign(rule.effect.delta)

  js.position = clamp(js.position + moveSign * steps, -2, 2)
  js.confidence = clamp(js.confidence + rule.effect.confidence, 0, 100)

  const fn = rule.effect.line
  emit(state, {
    actor: juror.id,
    type: 'respond',
    beatId: beat.id,
    lineFunction: fn,
    line: voice(state, juror, fn),
    delta: moveSign * steps,
    position: js.position,
  })
  if (fn === 'burden_drift') {
    state.driftActive = true
    emit(state, { actor: juror.id, type: 'drift' })
  }
}

function roomSign(state: DeliberationState): number {
  const playerSign = state.playerVerdict === 'guilty' ? 1 : -1
  return sign(playerSign + state.jurors.reduce((s, j) => s + sign(j.position), 0))
}

function peerPressure(state: DeliberationState, boost = 0): void {
  const toward = roomSign(state)
  if (toward === 0) return
  for (const js of state.jurors) {
    const p = clamp(PRESSURE[js.arc] + boost, 0, 1)
    if (state.rng() < p && sign(js.position) !== toward) {
      js.position = clamp(js.position + toward, -2, 2)
    }
  }
}

/** Play one open round: the player's action, the room's responses, the drift. */
export function playRound(state: DeliberationState, action: PlayerAction): void {
  if (state.phase !== 'open_1' && state.phase !== 'open_2' && state.phase !== 'open_3') {
    throw new Error(`No open round in phase ${state.phase}`)
  }

  if (action.type === 'pass') {
    emit(state, { actor: 'player', type: 'pass' })
    // Quiet round: two distinct jurors fill the silence with default-rule
    // chatter (picking the second from the remaining pool avoids the same
    // juror speaking both lines back-to-back).
    const firstJuror = pick(state.rng, state.caseData.jury.jurors)
    const remaining = state.caseData.jury.jurors.filter((j) => j.id !== firstJuror.id)
    const secondJuror = pick(state.rng, remaining)
    for (const juror of [firstJuror, secondJuror]) {
      const fn = juror.reaction_rules[juror.reaction_rules.length - 1].effect.line
      emit(state, {
        actor: juror.id,
        type: 'respond',
        lineFunction: fn,
        line: voice(state, juror, fn),
        delta: 0,
        position: state.jurors.find((s) => s.id === juror.id)!.position,
      })
      if (fn === 'burden_drift') {
        state.driftActive = true
        emit(state, { actor: juror.id, type: 'drift' })
      }
    }
  } else {
    const beat = beatById(state.caseData, action.beatId)
    const stance: Stance = action.type === 'cite_direction' ? 'proves' : action.stance
    const push: 'guilt' | 'innocence' =
      stance === 'proves'
        ? beat.direction
        : beat.direction === 'guilt'
          ? 'innocence'
          : 'guilt'
    emit(state, {
      actor: 'player',
      type: action.type === 'cite_direction' ? 'cite' : 'argue',
      beatId: beat.id,
      stance,
      push,
    })

    // Responders: jurors whose non-default rule matches speak first (heaviest
    // theme weight first), then one rng pick keeps the room lively.
    const jurors = state.caseData.jury.jurors
    const matched = jurors
      .filter((j) => {
        const r = matchRule(j, beat, stance, push)
        return r && j.reaction_rules.indexOf(r) < j.reaction_rules.length - 1
      })
      .sort((a, b) => {
        const wa = Math.max(...beat.tags.map((t) => a.weights[t] ?? 0), 0)
        const wb = Math.max(...beat.tags.map((t) => b.weights[t] ?? 0), 0)
        return wb - wa || a.seat - b.seat
      })
      .slice(0, SPEAKERS_PER_ROUND - 1)
    const rest = jurors.filter((j) => !matched.includes(j))
    const speakers = rest.length > 0 ? [...matched, pick(state.rng, rest)] : matched
    for (const juror of speakers) respond(state, juror, beat, stance, push)

    // Citing the burden direction while the room has drifted corrects it.
    if (
      action.type === 'cite_direction' &&
      state.driftActive &&
      !state.driftCorrectedByPlayer &&
      beat.tags.includes('burden')
    ) {
      state.driftCorrectedByPlayer = true
      emit(state, { actor: 'player', type: 'drift_corrected', beatId: beat.id })
    }
  }

  peerPressure(state)
  emit(state, { actor: 'room', type: 'positions', tally: tallyOf(state.jurors) })

  if (state.phase === 'open_1') {
    state.phase = 'open_2'
  } else if (state.phase === 'open_2') {
    state.phase = 'mid_vote'
    emit(state, { actor: 'room', type: 'vote', tally: tallyOf(state.jurors) })
    state.phase = 'open_3'
    // An uncorrected drift gives the room a chance to correct itself (v3 §9.5).
    if (state.driftActive && !state.driftCorrectedByPlayer && state.rng() < ROOM_SELF_CORRECT_P) {
      const corrector = state.caseData.jury.jurors.find(
        (j) => (j.lines.burden_correct?.length ?? 0) > 0,
      )
      if (corrector) {
        emit(state, {
          actor: corrector.id,
          type: 'respond',
          lineFunction: 'burden_correct',
          line: voice(state, corrector, 'burden_correct'),
          delta: 0,
          position: state.jurors.find((s) => s.id === corrector.id)!.position,
        })
      }
    }
  } else {
    state.phase = 'final_vote'
  }
}

/** Resolve final vote (and, if needed, the majority vote) into an outcome. */
export function finish(state: DeliberationState): Outcome {
  if (state.phase !== 'final_vote') {
    throw new Error(`Cannot finish from phase ${state.phase}`)
  }
  if (state.outcome) return state.outcome

  // The judge instructs undecided jurors to reach a view: they lean with the
  // room, or by lot if the room itself is level.
  const toward = roomSign(state)
  for (const js of state.jurors) {
    if (js.position === 0) {
      const lean = toward !== 0 ? toward : state.rng() < 0.5 ? 1 : -1
      js.position = lean
    }
  }

  const playerG = state.playerVerdict === 'guilty' ? 1 : 0
  const jurorTally = tallyOf(state.jurors)
  let g = jurorTally.g + playerG
  let ng = jurorTally.ng + (1 - playerG)
  emit(state, { actor: 'room', type: 'vote', tally: { g, ng, u: 0 } })

  let kind: Outcome['kind']
  let verdict: Outcome['verdict']
  if (g === 12 || ng === 12) {
    kind = 'unanimous'
    verdict = g === 12 ? 'guilty' : 'not_guilty'
  } else {
    // Deadlock direction, one last exchange under pressure, then majority vote.
    emit(state, {
      actor: 'judge',
      type: 'deadlock_direction',
      detail: 'A verdict of at least ten of you may now be accepted.',
    })
    peerPressure(state, 0.15)
    const t = tallyOf(state.jurors)
    // Any juror still undecided after pressure abstains to the defence side.
    g = t.g + playerG
    ng = 12 - g
    emit(state, { actor: 'room', type: 'vote', tally: { g, ng, u: 0 } })
    if (g >= MAJORITY_THRESHOLD) {
      kind = 'majority'
      verdict = 'guilty'
    } else if (ng >= MAJORITY_THRESHOLD) {
      kind = 'majority'
      verdict = 'not_guilty'
    } else {
      kind = 'hung'
      verdict = null
    }
  }

  state.outcome = {
    kind,
    verdict,
    tally: { g, ng },
    burdenDrift: {
      occurred: state.driftActive,
      correctedByPlayer: state.driftCorrectedByPlayer,
    },
  }
  emit(state, {
    actor: 'room',
    type: 'outcome',
    detail: `${kind}${verdict ? `:${verdict}` : ''}`,
    tally: { g, ng, u: 0 },
  })
  state.phase = 'done'
  return state.outcome
}

/** Run a whole deliberation in one call (tests, CI simulation, watch mode). */
export function runDeliberation(
  caseData: DocketCase,
  playerVerdict: PlayerVerdict,
  actions: PlayerAction[],
): { outcome: Outcome; log: RoomEvent[]; state: DeliberationState } {
  const state = startDeliberation(caseData, playerVerdict)
  const rounds: PlayerAction[] = [...actions]
  while (rounds.length < 3) rounds.push({ type: 'pass' })
  for (let i = 0; i < 3; i++) playRound(state, rounds[i])
  const outcome = finish(state)
  return { outcome, log: state.log, state }
}
