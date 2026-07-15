import { useEffect } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { speakAll, stopSpeech } from '../../lib/narration'
import { StatementCard } from './OpeningStatements'

export type Verdict = DocketCase['verdict_truth']

export function DocketVerdict({
  trial,
  conviction,
  onLock,
}: {
  trial: DocketCase
  conviction: number
  onLock: (verdict: Verdict) => void
}) {
  const { prosecution, defence } = trial.statements.closing
  const accused = trial.cast.find((m) => m.id === trial.accused.cast_id)

  // Narrate both closings in their advocates' voices; stop on unmount.
  useEffect(() => {
    speakAll([
      { text: prosecution.text, key: prosecution.speaker },
      { text: defence.text, key: defence.speaker },
    ])
    return stopSpeech
  }, [prosecution, defence])

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Closing arguments
        </p>
        <h2 className="text-xl font-semibold text-neutral-50">
          The last word from each side
        </h2>
      </div>

      <StatementCard trial={trial} statement={prosecution} side="prosecution" />
      <StatementCard trial={trial} statement={defence} side="defence" />

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-center">
        <p className="text-sm text-neutral-400">You ended at</p>
        <p className="text-2xl font-semibold text-neutral-100">
          {conviction}% convinced of guilt
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          To convict, you must be sure <em>beyond reasonable doubt</em>. Doubt
          alone is enough to acquit.
        </p>
      </div>

      <div className="space-y-2 text-center">
        <p className="text-sm leading-relaxed text-neutral-300">
          {accused?.name ?? 'The accused'} stands and turns to face you.
        </p>
        <p className="text-sm text-neutral-400">
          If you convict: <span className="text-neutral-200">{trial.accused.if_guilty}</span>
        </p>
        <p className="text-sm text-neutral-500">
          On the charge of {trial.charge}, how do you find? Locking is
          permanent — the room deliberates only after you cannot be swayed.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onLock('Not Guilty')}
          className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-4 font-semibold text-emerald-300 transition hover:bg-emerald-900/40"
        >
          Not Guilty
        </button>
        <button
          type="button"
          onClick={() => onLock('Guilty')}
          className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-4 font-semibold text-red-300 transition hover:bg-red-900/40"
        >
          Guilty
        </button>
      </div>
    </div>
  )
}
