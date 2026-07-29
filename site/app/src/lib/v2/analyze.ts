import type { DocketBeat, DocketCase } from './caseSchema'

/**
 * Verdict-only analysis for the docket loop. Mid-trial check-ins are gone;
 * the reveal compares the player's locked position to the editorial reference and
 * surfaces the decisive beats the case authors marked.
 */

export interface BeatReveal {
  beat: DocketBeat
}

export interface DocketAnalysis {
  matchesReference: boolean
  /** Decisive beats from case stamps — what the authors say mattered most. */
  whatMattered: BeatReveal[]
  /** Misleading beats — persuasive on the surface, weaker under the authors’ weight. */
  counterweights: BeatReveal[]
  reveals: BeatReveal[]
}

export function analyzeDocketPlay(
  c: DocketCase,
  verdict: DocketCase['reference_verdict'] | 'Undecided',
): DocketAnalysis {
  const reveals: BeatReveal[] = c.beats.map((beat) => ({ beat }))
  const whatMattered = reveals.filter((r) => r.beat.reveal_stamp === 'decisive')
  const counterweights = reveals.filter((r) => r.beat.reveal_stamp === 'misleading')

  return {
    matchesReference: verdict === c.reference_verdict,
    whatMattered,
    counterweights,
    reveals,
  }
}
