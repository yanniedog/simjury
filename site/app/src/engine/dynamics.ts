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
 *  1. the room can reach at least two distinct terminal outcomes across the
 *     strategy space (the deliberation must be able to surprise), and
 *  2. arguing the decisive evidence moves the room further toward
 *     `verdict_truth` than saying nothing (skilled play must matter).
 *
 * Strategies are deterministic functions of the case, so this gate is as
 * reproducible as the engine itself.
 */

function byWeightDesc(c: DocketCase, stamp: 'decisive' | 'misleading'): PlayerAction[] {
  const key = stamp === 'decisive' ? 'true_weight' : 'surface_persuasion'
  return c.beats
    .filter((b) => b.reveal_stamp === stamp)
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

/** The fixed strategy space the gate explores. */
export function strategies(c: DocketCase): Record<string, PlayerAction[]> {
  return {
    passive: [],
    decisive: byWeightDesc(c, 'decisive'),
    trappy: byWeightDesc(c, 'misleading'),
    counsel: [...byWeightDesc(c, 'decisive').slice(0, 2), ...citeBurden(c)],
  }
}

function signature(o: Outcome): string {
  return `${o.kind}:${o.verdict ?? 'none'}:${o.tally.g}-${o.tally.ng}`
}

/** Dynamics issues for one case (empty array = the room is alive). */
export function checkDynamics(c: DocketCase): string[] {
  const issues: string[] = []
  const space = strategies(c)
  const verdicts: PlayerVerdict[] = ['guilty', 'not_guilty']
  const truthSide: 'g' | 'ng' = c.verdict_truth === 'Guilty' ? 'g' : 'ng'

  // Variance must exist for a fixed player verdict — otherwise the "variety"
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

  for (const v of verdicts) {
    const decisive = outcomes.get(`${v}:decisive`)
    const passive = outcomes.get(`${v}:passive`)
    if (decisive && passive && decisive.tally[truthSide] < passive.tally[truthSide]) {
      issues.push(
        `arguing the decisive evidence (as ${v}) moves the room away from the true verdict — the room does not reward skilled play`,
      )
    }
  }

  return issues
}
