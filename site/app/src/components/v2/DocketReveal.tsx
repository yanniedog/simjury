import type { DocketCase } from '../../lib/v2/caseSchema'
import type { BeatReveal, DocketAnalysis } from '../../lib/v2/analyze'
import type { StoredPlay } from '../../lib/storage'
import type { Stats } from '../../lib/stats'
import { buildShareText } from '../../lib/share'
import { ShareCard } from '../ShareCard'
import { StatsPanel } from '../StatsPanel'
import { phaseNarratorCue } from '../../lib/narratorCues'
import type { Verdict } from './DocketVerdict'
import { NarratorCue } from './NarratorCue'

function WhatMatteredCard({ reveal, trial }: { reveal: BeatReveal; trial: DocketCase }) {
  const { beat } = reveal
  const pointsGuilt = beat.direction === 'guilt'
  return (
    <li className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-700 px-2 py-0.5 text-xs font-medium text-emerald-300">
          Decisive
        </span>
        <span className={`text-xs ${pointsGuilt ? 'text-red-400' : 'text-emerald-400'}`}>
          Supports {pointsGuilt ? 'convicting' : 'not convicting'}
        </span>
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
  isIntro = false,
}: {
  trial: DocketCase
  analysis: DocketAnalysis
  verdict: Verdict
  room: NonNullable<StoredPlay['room']>
  dayNumber: number
  stats: Stats
  onChooseAnother: () => void
  /** Guided intro is outside the daily queue - no Daily #N share card. */
  isIntro?: boolean
}) {
  const roomLabel =
    room.kind === 'hung'
      ? `hung, ${room.g}–${room.ng}`
      : `${room.verdict === 'guilty' ? 'Guilty' : 'Not guilty'}, ${room.g}–${room.ng}${
          room.kind === 'unanimous' ? ' unanimous' : ' by majority'
        }`

  const shareText = isIntro
    ? null
    : buildShareText({
        dayNumber,
        currentStreak: stats.currentStreak,
        room: { kind: room.kind, g: room.g, ng: room.ng },
      })

  const mattered = analysis.whatMattered.length > 0
    ? analysis.whatMattered
    : analysis.reveals.filter((r) => r.beat.reveal_stamp === 'decisive').slice(0, 3)

  return (
    <div className="phase-view reveal-view space-y-6">
      <NarratorCue text={phaseNarratorCue('reveal')} />

      <div className="judgment-record border p-5 text-center">
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          Your judgment is on the record.
        </h1>
        <p className="mt-2 text-sm text-neutral-300">
          Case outcome: <strong>{trial.verdict_truth}</strong> · Your verdict:{' '}
          <strong>{verdict}</strong>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          {analysis.correct
            ? 'You and the case outcome reached the same legal conclusion.'
            : 'You reached a different legal conclusion from the case outcome.'}
          {' '}That is something to examine, not a score.
        </p>
        <p className="mt-2 text-sm text-neutral-400">Jury room: {roomLabel}.</p>
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

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/20 p-4">
        <h2 className="font-semibold text-neutral-200">What mattered</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          The pieces of evidence the case authors marked as decisive.
        </p>
        <ul className="mt-4 space-y-3">
          {mattered.map((reveal) => (
            <WhatMatteredCard key={reveal.beat.id} reveal={reveal} trial={trial} />
          ))}
        </ul>
      </div>

      <div className="record-tools">
        {isIntro ? (
          <p className="text-sm text-neutral-500">
            Guided intro complete. Daily streak and share cards stay with the featured sittings.
          </p>
        ) : (
          <>
            <StatsPanel stats={stats} />
            {shareText ? <ShareCard text={shareText} /> : null}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onChooseAnother}
        className="w-full rounded-lg border border-neutral-700 px-4 py-3 font-semibold text-neutral-200 transition hover:bg-neutral-800"
      >
        Choose another sitting
      </button>
    </div>
  )
}
