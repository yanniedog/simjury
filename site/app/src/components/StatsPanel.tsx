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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="grid grid-cols-4 gap-2">
        <Stat value={String(stats.played)} label="Played" />
        <Stat value={`${Math.round(stats.winRate * 100)}%`} label="Correct" />
        <Stat value={`🔥 ${stats.currentStreak}`} label="Streak" />
        <Stat value={String(stats.maxStreak)} label="Best" />
      </div>
    </div>
  )
}
