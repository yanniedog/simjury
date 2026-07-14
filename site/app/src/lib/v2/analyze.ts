import { START_CONVICTION, movedToward } from '../game'
import type { DocketBeat, DocketCase } from './caseSchema'

/**
 * Check-in trap analysis for the docket loop. The v1 game recorded a
 * conviction after every beat; the 8–10 minute loop records one at each
 * check-in instead, so sway is measured per check-in segment: a misleading
 * beat "took" the juror if the segment containing it moved toward that trap.
 * Beats after the final check-in have no movement window and can never be
 * scored as bait — the design gate keeps traps inside checked-in territory.
 */

export interface Segment {
  /** The check-in beat that closes this segment; null for a trailing tail. */
  checkinId: string | null
  beats: DocketBeat[]
  /** Conviction going into the segment (0..100). */
  before: number
  /** Conviction recorded at the check-in (0..100). */
  after: number
}

export interface BeatReveal {
  beat: DocketBeat
  /** True only for a misleading beat whose segment moved its way. */
  tookBait: boolean
}

export interface DocketAnalysis {
  correct: boolean
  segments: Segment[]
  reveals: BeatReveal[]
  trapsSwayed: number
  totalTraps: number
}

export function analyzeDocketPlay(
  c: DocketCase,
  /** Slider values recorded at each check-in, in check-in order. */
  checkinValues: number[],
  verdict: DocketCase['verdict_truth'],
): DocketAnalysis {
  const checkins = new Set(c.checkins)
  const segments: Segment[] = []
  let before = START_CONVICTION
  let taken = 0
  let current: DocketBeat[] = []

  for (const beat of c.beats) {
    current.push(beat)
    if (checkins.has(beat.id)) {
      const after = checkinValues[taken] ?? before
      taken++
      segments.push({ checkinId: beat.id, beats: current, before, after })
      before = after
      current = []
    }
  }
  if (current.length > 0) {
    segments.push({ checkinId: null, beats: current, before, after: before })
  }

  const reveals: BeatReveal[] = segments.flatMap((s) =>
    s.beats.map((beat) => ({
      beat,
      tookBait:
        beat.reveal_stamp === 'misleading' &&
        movedToward(beat.direction, s.before, s.after),
    })),
  )

  // A trailing tail (no closing check-in) is created with after === before,
  // so a misleading beat there can never be marked tookBait — it never had a
  // movement window. Only count traps that fall inside a scored segment, or
  // "traps dodged" inflates with beats the player had no chance to sway on.
  const scorableTraps = segments
    .filter((s) => s.checkinId !== null)
    .reduce(
      (n, s) => n + s.beats.filter((b) => b.reveal_stamp === 'misleading').length,
      0,
    )

  return {
    correct: verdict === c.verdict_truth,
    segments,
    reveals,
    trapsSwayed: reveals.filter((r) => r.tookBait).length,
    totalTraps: scorableTraps,
  }
}
