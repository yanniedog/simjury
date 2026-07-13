import type { TrialBeat, TrialCase } from './caseSchema'

type Verdict = TrialCase['verdict_truth']

/**
 * Design-quality gate for cases. The schema guarantees a case is well-*formed*;
 * this guarantees it is well-*designed* as a puzzle:
 *
 *  - it contains a trap (a beat that feels more persuasive than it is worth),
 *  - it contains a real signal (a decisive beat that carries genuine weight),
 *  - it argues both guilt and innocence, and
 *  - it is actually solvable — the decisive evidence, on balance, points to the
 *    true verdict rather than away from it.
 *
 * Run over the whole queue it also enforces uniqueness and verdict variety, so
 * the daily never repeats an id/date/title or becomes predictable.
 */

/** A misleading beat must feel this much more persuasive than it is truly worth. */
export const MISLEAD_MIN_GAP = 0.25
/** A decisive beat must carry at least this much true weight. */
export const DECISIVE_MIN_WEIGHT = 0.6
/** Tolerance so floating-point subtraction can't reject a case that is exactly on a threshold. */
const EPSILON = 1e-9

export interface QualityIssue {
  caseId: string
  message: string
}

/**
 * The structural slice the design checks need. Both the v1 daily case and the
 * v2 docket case satisfy it, so `checkCase` / `checkQueue` serve both gates.
 */
export type DesignedCase = Pick<TrialCase, 'beats' | 'verdict_truth'>
export type QueueCase = DesignedCase &
  Pick<TrialCase, 'id' | 'publish_date' | 'title'>

function directionMatchesVerdict(
  direction: TrialBeat['direction'],
  verdict: Verdict,
): boolean {
  return (direction === 'guilt') === (verdict === 'Guilty')
}

/** Design issues for a single case (empty array = good). */
export function checkCase(c: DesignedCase): string[] {
  const issues: string[] = []
  const misleading = c.beats.filter((b) => b.reveal_stamp === 'misleading')
  const decisive = c.beats.filter((b) => b.reveal_stamp === 'decisive')
  const directions = new Set(c.beats.map((b) => b.direction))

  if (misleading.length === 0) {
    issues.push('needs at least one misleading beat (the trap)')
  }
  if (decisive.length === 0) {
    issues.push('needs at least one decisive beat (the real signal)')
  }
  if (!(directions.has('guilt') && directions.has('innocence'))) {
    issues.push('beats must argue both guilt and innocence')
  }

  for (const b of misleading) {
    if (b.surface_persuasion - b.true_weight < MISLEAD_MIN_GAP - EPSILON) {
      issues.push(
        `misleading beat ${b.id} must feel more persuasive than it is worth ` +
          `(surface_persuasion - true_weight >= ${MISLEAD_MIN_GAP})`,
      )
    }
    // A trap that actually points at the truth isn't a trap — a player who
    // follows it ends up correct, so `analyzePlay` would wrongly count "moved
    // toward the truth" as "took the bait".
    if (directionMatchesVerdict(b.direction, c.verdict_truth)) {
      issues.push(
        `misleading beat ${b.id} must point away from the true verdict ` +
          `(a trap that reinforces the truth cannot mislead)`,
      )
    }
    // Same reasoning as the minor-beat guard below: a beat stamped "misleading"
    // must not secretly be the real, decisive evidence, or the reveal lies to
    // the player about which beats mattered.
    if (b.true_weight >= DECISIVE_MIN_WEIGHT - EPSILON) {
      issues.push(
        `misleading beat ${b.id} must not carry decisive weight ` +
          `(true_weight < ${DECISIVE_MIN_WEIGHT})`,
      )
    }
  }
  for (const b of decisive) {
    if (b.true_weight < DECISIVE_MIN_WEIGHT - EPSILON) {
      issues.push(
        `decisive beat ${b.id} must carry real weight ` +
          `(true_weight >= ${DECISIVE_MIN_WEIGHT})`,
      )
    }
  }
  // A `minor` beat is context, not a signal — it must not secretly carry
  // decisive weight, or its stamp is a lie (a real risk in generated cases).
  for (const b of c.beats.filter((x) => x.reveal_stamp === 'minor')) {
    if (b.true_weight >= DECISIVE_MIN_WEIGHT) {
      issues.push(
        `minor beat ${b.id} must not carry decisive weight ` +
          `(true_weight < ${DECISIVE_MIN_WEIGHT})`,
      )
    }
  }

  // Weighed, not just counted: a single heavy decisive beat can outweigh
  // several light ones, so solvability must be judged by true_weight, not by
  // how many decisive beats fall on each side.
  const alignedWeight = decisive
    .filter((b) => directionMatchesVerdict(b.direction, c.verdict_truth))
    .reduce((sum, b) => sum + b.true_weight, 0)
  const totalDecisiveWeight = decisive.reduce((sum, b) => sum + b.true_weight, 0)
  const opposedWeight = totalDecisiveWeight - alignedWeight
  if (decisive.length > 0 && alignedWeight - opposedWeight <= EPSILON) {
    issues.push(
      'the decisive beats must, on balance by weight, point to the true verdict ' +
        '(the case must be solvable)',
    )
  }

  return issues
}

/** Design + integrity issues across the whole queue (empty array = good). */
export function checkQueue(cases: QueueCase[]): QualityIssue[] {
  const issues: QualityIssue[] = []

  for (const c of cases) {
    for (const message of checkCase(c)) issues.push({ caseId: c.id, message })
  }

  const flagDuplicates = (field: 'id' | 'publish_date' | 'title') => {
    const seen = new Set<string>()
    for (const c of cases) {
      const value = c[field]
      if (seen.has(value)) {
        issues.push({ caseId: c.id, message: `duplicate ${field}: ${value}` })
      }
      seen.add(value)
    }
  }
  flagDuplicates('id')
  flagDuplicates('publish_date')
  flagDuplicates('title')

  // Once the queue is more than a couple of cases, it should not be all one
  // verdict — otherwise the "twist" becomes guessable from habit.
  if (cases.length >= 3) {
    const verdicts = new Set(cases.map((c) => c.verdict_truth))
    if (verdicts.size < 2) {
      issues.push({
        caseId: '(queue)',
        message: 'every case has the same verdict; vary Guilty / Not Guilty',
      })
    }
  }

  return issues
}
