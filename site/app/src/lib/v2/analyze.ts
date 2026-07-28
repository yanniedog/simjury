import type { DocketBeat, DocketCase } from './caseSchema'

/**
 * Verdict-only analysis for the docket loop. Mid-trial check-ins are gone;
 * the reveal compares the player's locked verdict to the authored outcome and
 * surfaces the decisive beats the case authors marked.
 */

export interface BeatReveal {
  beat: DocketBeat
}

export interface DocketAnalysis {
  matchesReference: boolean
  /** Decisive beats from case stamps — what the authors say mattered most. */
  whatMattered: BeatReveal[]
  reveals: BeatReveal[]
}

export function analyzeDocketPlay(
  c: DocketCase,
  verdict: DocketCase['reference_verdict'],
): DocketAnalysis {
  const reveals: BeatReveal[] = c.beats.map((beat) => ({ beat }))
  const whatMattered = reveals.filter((r) => r.beat.reveal_stamp === 'decisive')

  return {
    matchesReference: verdict === c.reference_verdict,
    whatMattered,
    reveals,
  }
}
