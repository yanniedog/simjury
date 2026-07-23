import type { DocketCase } from '../../lib/v2/caseSchema'
import type { BeatReveal, DocketAnalysis } from '../../lib/v2/analyze'
import type { StoredPlay } from '../../lib/storage'
import type { Stats } from '../../lib/stats'
import { buildShareText } from '../../lib/share'
import { ShareCard } from '../ShareCard'
import { StatsPanel } from '../StatsPanel'
import type { Verdict } from './DocketVerdict'

const STAMP = {
  decisive: { label: 'Decisive', cls: 'border-emerald-700 text-emerald-300' },
  minor: { label: 'Minor', cls: 'border-neutral-700 text-neutral-400' },
  misleading: { label: 'Overstated', cls: 'border-amber-700 text-amber-300' },
} as const

function WeightBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <div className="mt-1 h-2 rounded bg-neutral-800">
        <div className={`h-2 rounded ${tone}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

function BeatRevealCard({ reveal, trial }: { reveal: BeatReveal; trial: DocketCase }) {
  const { beat, tookBait } = reveal
  const stamp = STAMP[beat.reveal_stamp]
  const pointsGuilt = beat.direction === 'guilt'
  return (
    <li className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${stamp.cls}`}>
          {stamp.label}
        </span>
        <span className={`text-xs ${pointsGuilt ? 'text-red-400' : 'text-emerald-400'}`}>
          Supports {pointsGuilt ? 'convicting' : 'not convicting'}
        </span>
        {tookBait && (
          <span className="ml-auto text-xs font-medium text-amber-400">
            This shifted your view
          </span>
        )}
      </div>
      {beat.turns ? (
        <ul className="space-y-1 text-sm text-neutral-300" aria-label="Attributed transcript recap">
          {beat.turns.map((turn, index) => (
            <li key={`${turn.speaker}-${index}`}>
              <strong>{trial.cast.find((member) => member.id === turn.speaker)?.name ?? turn.speaker}:</strong>{' '}
              {turn.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-300">{beat.text}</p>
      )}
      <div className="space-y-2">
        <WeightBar label="How persuasive it may feel" value={beat.surface_persuasion} tone="bg-neutral-500" />
        <WeightBar
          label="Authored evidentiary weight"
          value={beat.true_weight}
          tone={pointsGuilt ? 'bg-red-500' : 'bg-emerald-500'}
        />
      </div>
      <p className="text-sm leading-relaxed text-neutral-400">{beat.reveal_note}</p>
    </li>
  )
}

export function DocketReveal({
  trial,
  analysis,
  verdict,
  room,
  dayNumber,
  stats,
  onChooseAnother,
}: {
  trial: DocketCase
  analysis: DocketAnalysis
  verdict: Verdict
  room: NonNullable<StoredPlay['room']>
  dayNumber: number
  stats: Stats
  onChooseAnother: () => void
}) {
  const roomLabel =
    room.kind === 'hung'
      ? `hung, ${room.g}–${room.ng}`
      : `${room.verdict === 'guilty' ? 'Guilty' : 'Not guilty'}, ${room.g}–${room.ng}${
          room.kind === 'unanimous' ? ' unanimous' : ' by majority'
        }`

  const shareText = buildShareText({
    dayNumber,
    convictions: analysis.segments
      .filter((s) => s.checkinId !== null)
      .map((s) => s.after),
    currentStreak: stats.currentStreak,
    room: { kind: room.kind, g: room.g, ng: room.ng },
  })

  return (
    <div className="phase-view reveal-view space-y-6">
      <div className="judgment-record border p-5 text-center">
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          Your judgment is on the record.
        </h1>
        <p className="mt-2 text-sm text-neutral-300">
          Authored outcome: <strong>{trial.verdict_truth}</strong> · Your verdict:{' '}
          <strong>{verdict}</strong>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          {analysis.correct
            ? "You and the case's authored outcome reached the same legal conclusion."
            : "You reached a different legal conclusion from the case's authored outcome."}
          {' '}That is something to examine, not a score.
        </p>
        <p className="mt-2 text-sm text-neutral-400">Your fictional jury room: {roomLabel}.</p>
      </div>

      <p className="text-sm leading-relaxed text-neutral-300">{trial.twist}</p>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          What happened next
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          {trial.epilogue}
        </p>
      </div>

      <details className="group rounded-lg border border-neutral-800 bg-neutral-900/20 p-4">
        <summary className="cursor-pointer font-semibold text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
          Review how the evidence was authored
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Compare what moved you with the weight assigned by the case authors.
        </p>
        <ul className="mt-4 space-y-3">
          {analysis.reveals.map((reveal) => (
            <BeatRevealCard key={reveal.beat.id} reveal={reveal} trial={trial} />
          ))}
        </ul>
      </details>

      <div className="record-tools">
        <StatsPanel stats={stats} />
        <ShareCard text={shareText} />
      </div>

      <button
        type="button"
        onClick={onChooseAnother}
        className="w-full rounded-lg border border-neutral-700 px-4 py-3 font-semibold text-neutral-200 transition hover:bg-neutral-800"
      >
        Choose another sitting
      </button>

      <p className="text-center text-xs text-neutral-600">
        The authored outcome belongs to this fictional case; reasonable jurors
        may still disagree. Choose another sitting when you’re ready.
      </p>
    </div>
  )
}
