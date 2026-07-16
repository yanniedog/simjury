/** Cross-day participation stats, derived without grading a juror's verdict. */

export interface DayResult {
  /** Day index (see daily.ts). */
  day: number
}

export interface Stats {
  played: number
  /** Consecutive completed sittings, ending at the latest play. */
  currentStreak: number
  /** The longest run of completed daily sittings. */
  maxStreak: number
}

export function computeStats(results: DayResult[]): Stats {
  const sortedDays = [...new Set(results.map((r) => r.day))].sort((a, b) => a - b)
  const played = sortedDays.length

  let maxStreak = 0
  let run = 0
  let prevDay: number | null = null
  for (const day of sortedDays) {
    if (prevDay !== null && day === prevDay + 1) {
      run += 1
    } else {
      run = 1
    }
    if (run > maxStreak) maxStreak = run
    prevDay = day
  }

  // Current streak: the trailing run of consecutive completed docket days.
  let currentStreak = 0
  for (let i = sortedDays.length - 1; i >= 0; i--) {
    if (i < sortedDays.length - 1 && sortedDays[i + 1] !== sortedDays[i] + 1) break
    currentStreak += 1
  }

  return { played, currentStreak, maxStreak }
}
