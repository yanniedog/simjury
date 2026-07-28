import type { DocketCase } from '../lib/v2/caseSchema'
import {
  runDeliberation,
  type Outcome,
  type PlayerAction,
  type PlayerVerdict,
} from './deliberation'

/**
 * Deliberation-dynamics gate: simulates each case's jury room against a fixed
 * strategy space and rejects rooms with foregone conclusions. A docket case
 * only ships if
 *
 *  1. for EACH position the player can lock after deliberation, the room
 *     reaches at least two distinct terminal outcomes (kind + verdict) across
 *     the strategy space (arguments must still be able to surprise, whichever
 *     way the player later locks their own vote), and
 *  2. for each locked position, arguing the central evidence moves the room
 *     strictly further toward the authors' `reference_verdict` than saying
 *     nothing — unless passive play already maxes out that side's tally.
 *
 * Strategies are deterministic functions of the case, so this gate is as
 * reproducible as the engine itself. The player's vote is applied only at
 * finish and does not reseed open-round deliberation.
 */

function referenceDirection(c: DocketCase): 'guilt' | 'innocence' {
  return c.reference_verdict === 'Guilty' ? 'guilt' : 'innocence'
}

/**
 * Top beats by weight for a reveal stamp, as `argue` actions. `direction`
 * beats are never eligible — `playRound` requires those to be cited, not
 * argued — and for the legacy `decisive` stamp only reference-aligned beats are picked,
 * since a case may (validly) carry decisive evidence on both sides as long
 * as the reference side wins on total weight; arguing an opposed central beat
 * would spend a skilled-play round pushing away from the editorial reference.
 */
function byWeightDesc(c: DocketCase, stamp: 'decisive' | 'misleading'): PlayerAction[] {
  const key = stamp === 'decisive' ? 'true_weight' : 'surface_persuasion'
  const reference = referenceDirection(c)
  return c.beats
    .filter((b) => b.kind !== 'direction' && b.reveal_stamp === stamp)
    .filter((b) => stamp !== 'decisive' || b.direction === reference)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 3)
    .map((b) => ({ type: 'argue', beatId: b.id, stance: 'proves' }))
}

function citeBurden(c: DocketCase): PlayerAction[] {
  const direction = c.beats.find(
    (b) => b.kind === 'direction' && b.tags.includes('burden'),
  )
  return direction ? [{ type: 'cite_direction', beatId: direction.id }] : []
}

/** The strongest complete theory, including corroboration below the decisive stamp. */
function referenceSynthesis(c: DocketCase): PlayerAction[] {
  const reference = referenceDirection(c)
  return c.beats
    .filter((b) => b.kind !== 'direction' && b.direction === reference)
    .sort((a, b) => b.true_weight - a.true_weight)
    .slice(0, 3)
    .map((b) => ({ type: 'argue', beatId: b.id, stance: 'proves' }))
}

/** The fixed strategy space the gate explores. */
export function strategies(c: DocketCase): Record<string, PlayerAction[]> {
  return {
    passive: [],
    decisive: byWeightDesc(c, 'decisive'),
    synthesis: referenceSynthesis(c),
    trappy: byWeightDesc(c, 'misleading'),
    counsel: [...byWeightDesc(c, 'decisive').slice(0, 2), ...citeBurden(c)],
  }
}

// Outcome variety is judged at the verdict level (kind + verdict), not the
// exact vote tally — two hung results with different splits are still the same
// terminal outcome for a player.
function signature(o: Outcome): string {
  return `${o.kind}:${o.verdict ?? 'none'}`
}

/** Dynamics issues for one case (empty array = the room is alive). */
export function checkDynamics(c: DocketCase): string[] {
  const issues: string[] = []
  const space = strategies(c)
  const verdicts: PlayerVerdict[] = ['guilty', 'not_guilty', 'undecided']
  const referenceSide: 'g' | 'ng' = c.reference_verdict === 'Guilty' ? 'g' : 'ng'

  // Variance must exist for a fixed player position — otherwise the "variety"
  // is just the player's own vote moving the tally, not the room moving.
  // Required for BOTH verdicts: whichever way the player locks their own
  // vote, their arguments must still be able to change the room's outcome.
  const outcomes = new Map<string, Outcome>()
  for (const v of verdicts) {
    const seen = new Set<string>()
    for (const [name, actions] of Object.entries(space)) {
      const { outcome } = runDeliberation(c, v, actions)
      seen.add(signature(outcome))
      outcomes.set(`${v}:${name}`, outcome)
    }
    if (seen.size < 2) {
      issues.push(
        `the room reaches the same outcome under every strategy when the player locks ${v} — the deliberation is a foregone conclusion`,
      )
    }
  }

  const MAX_REFERENCE_TALLY = 12
  for (const v of verdicts) {
    const decisive = outcomes.get(`${v}:decisive`)
    const passive = outcomes.get(`${v}:passive`)
    if (!decisive || !passive) continue
    if (decisive.tally[referenceSide] < passive.tally[referenceSide]) {
      issues.push(
        `arguing the central evidence (as ${v}) moves the room away from the authors' reference verdict — the room does not reward skilled play`,
      )
    } else if (
      decisive.tally[referenceSide] === passive.tally[referenceSide] &&
      passive.tally[referenceSide] < MAX_REFERENCE_TALLY
    ) {
      issues.push(
        `arguing the central evidence (as ${v}) does not move the room any further toward the authors' reference verdict than doing nothing — the room does not reward skilled play`,
      )
    }
  }

  return issues
}
