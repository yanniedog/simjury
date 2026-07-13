import type { TrialBeat, TrialCase } from './caseSchema'

/** The four screens of a single day's play. */
export type Phase = 'intro' | 'beats' | 'verdict' | 'reveal'

export type Verdict = TrialCase['verdict_truth']

/** Where the conviction slider starts each day: a neutral, open mind. */
export const START_CONVICTION = 50

/** Coarse band for a conviction value (0..100), used for colour/labels. */
export function convictionBand(
  value: number,
): 'lean-innocent' | 'uncertain' | 'lean-guilty' {
  if (value < 34) return 'lean-innocent'
  if (value > 66) return 'lean-guilty'
  return 'uncertain'
}

/**
 * Did the juror's conviction move in [direction] across a beat? "Guilt" beats
 * pull the slider up; "innocence" beats pull it down. A flat move counts as not
 * swayed.
 */
export function movedToward(
  direction: TrialBeat['direction'],
  before: number,
  after: number,
): boolean {
  return direction === 'guilt' ? after > before : after < before
}

export interface BeatOutcome {
  beat: TrialBeat
  /** Conviction just before this beat (0..100). */
  before: number
  /** Conviction the juror set after this beat (0..100). */
  after: number
  /** True only for a `misleading` beat that pulled the juror its way. */
  tookBait: boolean
}

export interface PlayAnalysis {
  correct: boolean
  outcomes: BeatOutcome[]
  /** How many misleading beats swayed the juror toward their trap. */
  swayedByTraps: number
  /** How many misleading beats the case contained. */
  totalTraps: number
}

/**
 * Score a completed play. `convictions[i]` is the slider value the juror locked
 * in after beat `i` (same length and order as `trial.beats`).
 */
export function analyzePlay(
  trial: TrialCase,
  convictions: number[],
  verdict: Verdict,
): PlayAnalysis {
  const outcomes: BeatOutcome[] = trial.beats.map((beat, i) => {
    // Fall back to the running value if a conviction is missing, so a truncated
    // array can never produce NaN comparisons downstream.
    const before = i === 0 ? START_CONVICTION : convictions[i - 1] ?? START_CONVICTION
    const after = convictions[i] ?? before
    const tookBait =
      beat.reveal_stamp === 'misleading' &&
      movedToward(beat.direction, before, after)
    return { beat, before, after, tookBait }
  })

  return {
    correct: verdict === trial.verdict_truth,
    outcomes,
    swayedByTraps: outcomes.filter((o) => o.tookBait).length,
    totalTraps: trial.beats.filter((b) => b.reveal_stamp === 'misleading')
      .length,
  }
}
