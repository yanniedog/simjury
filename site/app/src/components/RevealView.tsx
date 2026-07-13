import type { TrialCase } from '../lib/caseSchema'
import type { BeatOutcome, PlayAnalysis, Verdict } from '../lib/game'
import type { Stats } from '../lib/stats'
import { buildShareText } from '../lib/share'
import { ShareCard } from './ShareCard'
import { StatsPanel } from './StatsPanel'

const STAMP = {
  decisive: { label: 'Decisive', cls: 'border-emerald-700 text-emerald-300' },
  minor: { label: 'Minor', cls: 'border-neutral-700 text-neutral-400' },
  misleading: { label: 'Misleading', cls: 'border-amber-700 text-amber-300' },
} as const

function WeightBar({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-2 rounded bg-neutral-800">
        <div
          className={`h-2 rounded ${tone}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  )
}

function BeatReveal({ outcome }: { outcome: BeatOutcome }) {
  const { beat, tookBait } = outcome
  const stamp = STAMP[beat.reveal_stamp]
  const pointsGuilt = beat.direction === 'guilt'

  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stamp.cls}`}
        >
          {stamp.label}
        </span>
        <span
          className={`text-xs ${pointsGuilt ? 'text-red-400' : 'text-emerald-400'}`}
        >
          Points to {pointsGuilt ? 'guilt' : 'innocence'}
        </span>
        {tookBait && (
          <span className="ml-auto text-xs font-medium text-amber-400">
            This one swayed you
          </span>
        )}
      </div>

      <p className="text-sm text-neutral-300">{beat.text}</p>

      <div className="space-y-2">
        <WeightBar
          label="How convincing it felt"
          value={beat.surface_persuasion}
          tone="bg-neutral-500"
        />
        <WeightBar
          label="What it was actually worth"
          value={beat.true_weight}
          tone={pointsGuilt ? 'bg-red-500' : 'bg-emerald-500'}
        />
      </div>

      <p className="text-sm leading-relaxed text-neutral-400">
        {beat.reveal_note}
      </p>
    </li>
  )
}

export function RevealView({
  trial,
  analysis,
  verdict,
  dayNumber,
  stats,
}: {
  trial: TrialCase
  analysis: PlayAnalysis
  verdict: Verdict
  dayNumber: number
  stats: Stats
}) {
  const shareText = buildShareText({
    dayNumber,
    convictions: analysis.outcomes.map((o) => o.after),
    correct: analysis.correct,
    swayedByTraps: analysis.swayedByTraps,
    totalTraps: analysis.totalTraps,
    currentStreak: stats.currentStreak,
  })

  return (
    <div className="space-y-6">
      <div
        className={`rounded-lg border p-5 text-center ${
          analysis.correct
            ? 'border-emerald-800 bg-emerald-950/30'
            : 'border-red-900 bg-red-950/30'
        }`}
      >
        <p className="text-2xl font-semibold text-neutral-50">
          {analysis.correct ? 'You read it right' : 'The evidence fooled you'}
        </p>
        <p className="mt-2 text-sm text-neutral-300">
          The truth: <strong>{trial.verdict_truth}</strong> · You said:{' '}
          <strong>{verdict}</strong>
        </p>
        {analysis.totalTraps > 0 && (
          <p className="mt-1 text-sm text-neutral-400">
            You resisted {analysis.totalTraps - analysis.swayedByTraps} of{' '}
            {analysis.totalTraps} traps.
          </p>
        )}
      </div>

      <StatsPanel stats={stats} />

      <p className="text-sm leading-relaxed text-neutral-300">{trial.twist}</p>

      <div>
        <p className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
          What each piece was really worth
        </p>
        <ul className="space-y-3">
          {analysis.outcomes.map((outcome) => (
            <BeatReveal key={outcome.beat.id} outcome={outcome} />
          ))}
        </ul>
      </div>

      <ShareCard text={shareText} />

      <p className="text-center text-xs text-neutral-600">
        A new case tomorrow.
      </p>
    </div>
  )
}
