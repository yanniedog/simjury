export type DocketPhase =
  | 'intro'
  | 'openings'
  | 'beats'
  | 'closings'
  | 'juryroom'
  | 'reveal'

/**
 * The six stages, weighted by real work rather than by count.
 *
 * The top bar showed six equal stages. Stage three, Evidence, is fourteen beats
 * and roughly half the twenty minutes — and the bar did not move for any of
 * them. A progress indicator frozen for the longest stretch is worse than none,
 * because it actively suggests nothing is happening.
 *
 * Evidence carries half the total; the jury room, the other thing you actually
 * do, carries a sixth. See docs/DESIGN-PROTOCOL.md rule 9.
 */
export const PHASES: Array<{ id: DocketPhase; label: string; weight: number }> = [
  { id: 'intro', label: 'Briefing', weight: 1 },
  { id: 'openings', label: 'Openings', weight: 1 },
  { id: 'beats', label: 'Evidence', weight: 6 },
  { id: 'closings', label: 'Closings', weight: 1 },
  { id: 'juryroom', label: 'Jury room', weight: 2 },
  { id: 'reveal', label: 'Record', weight: 1 },
]

const TOTAL_WEIGHT = PHASES.reduce((total, { weight }) => total + weight, 0)

/**
 * How far through the sitting the player actually is, 0–1.
 *
 * `within` is progress inside the current phase — evidence beat 3 of 14 is
 * 3/14 — so the bar moves on every beat rather than once per phase.
 */
export function sittingProgress(phase: DocketPhase, within = 1): number {
  const index = PHASES.findIndex((step) => step.id === phase)
  if (index < 0) return 0
  const before = PHASES.slice(0, index).reduce((total, { weight }) => total + weight, 0)
  const clamped = Math.min(Math.max(within, 0), 1)
  return (before + PHASES[index].weight * clamped) / TOTAL_WEIGHT
}
