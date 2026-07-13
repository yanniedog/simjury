/**
 * Cross-day player stats: the retention half of a daily game. Pure — it takes a
 * list of past day results and derives streaks and a win rate, so it is trivial
 * to test and independent of storage.
 */

export interface DayResult {
  /** Day index (see daily.ts). */
  day: number
  correct: boolean
}

export interface Stats {
  played: number
  wins: number
  /** 0..1. */
  winRate: number
  /** Consecutive correct verdicts on consecutive days, ending at the latest play. */
  currentStreak: number
  /** The longest such run ever. */
  maxStreak: number
}

export function computeStats(results: DayResult[]): Stats {
  const played = results.length
  const wins = results.filter((r) => r.correct).length
  const sorted = [...results].sort((a, b) => a.day - b.day)

  let maxStreak = 0
  let run = 0
  let prevDay: number | null = null
  for (const r of sorted) {
    if (!r.correct) {
      run = 0
    } else if (prevDay !== null && r.day === prevDay + 1) {
      run += 1
    } else {
      run = 1
    }
    if (run > maxStreak) maxStreak = run
    prevDay = r.day
  }

  // Current streak: the trailing run of consecutive correct days ending at the
  // most recent play. A loss or a gap on the latest day breaks it.
  let currentStreak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const r = sorted[i]
    if (!r.correct) break
    if (i < sorted.length - 1 && sorted[i + 1].day !== r.day + 1) break
    currentStreak += 1
  }

  return {
    played,
    wins,
    winRate: played === 0 ? 0 : wins / played,
    currentStreak,
    maxStreak,
  }
}
