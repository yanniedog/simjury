import type { Stats } from '../lib/stats'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-semibold text-neutral-50">{value}</span>
      <span className="text-[0.7rem] uppercase tracking-wide text-neutral-500">
        {label}
      </span>
    </div>
  )
}

export function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4" role="region" aria-label="Your private docket history">
      <p className="mb-4 text-center text-xs uppercase tracking-wider text-neutral-500">
        Your private docket history
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(stats.played)} label="Cases heard" />
        <Stat value={String(stats.currentStreak)} label="Daily sittings" />
        <Stat value={String(stats.maxStreak)} label="Longest run" />
      </div>
      <p className="mt-4 text-center text-xs text-neutral-600">
        Kept only in this browser. Every completed sitting counts.
      </p>
    </div>
  )
}
