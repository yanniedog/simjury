import { useEffect, useState } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { StatementCard } from './OpeningStatements'
import { CourtroomStage } from './CourtroomStage'

export type Verdict = DocketCase['verdict_truth']

export function DocketVerdict({
  trial,
  conviction,
  narration,
  playbackRate,
  onLock,
}: {
  trial: DocketCase
  conviction: number
  narration: boolean
  playbackRate: NarrationRate
  onLock: (verdict: Verdict) => void
}) {
  const { prosecution, defence } = trial.statements.closing
  const accused = trial.cast.find((m) => m.id === trial.accused.cast_id)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  // Narrate both closings in their advocates' voices; stop on unmount.
  useEffect(() => {
    if (!narration) {
      setActiveSpeaker(null)
      return stopSpeech
    }
    speakAll([
      { text: prosecution.text, key: prosecution.speaker },
      { text: defence.text, key: defence.speaker },
    ], {
      rate: playbackRate,
      onLine: setActiveSpeaker,
      done: () => setActiveSpeaker(null),
    })
    return stopSpeech
  }, [prosecution.text, prosecution.speaker, defence.text, defence.speaker, narration, playbackRate])

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Closing arguments
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-xl font-semibold text-neutral-50 focus:outline-none">
          The last word from each side
        </h1>
      </div>

      <CourtroomStage trial={trial} activeSpeakerId={activeSpeaker} phaseLabel="Closing arguments" />

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
          final for today's sitting—the room responds only after you commit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onLock('Not Guilty')}
          className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-4 font-semibold text-emerald-300 transition hover:bg-emerald-900/40"
        >
          <span className="block">Not persuaded to convict</span>
          <span className="mt-1 block text-xs font-normal">Verdict: Not guilty</span>
        </button>
        <button
          type="button"
          onClick={() => onLock('Guilty')}
          className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-4 font-semibold text-red-300 transition hover:bg-red-900/40"
        >
          <span className="block">Persuaded beyond reasonable doubt</span>
          <span className="mt-1 block text-xs font-normal">Verdict: Guilty</span>
        </button>
      </div>
    </div>
  )
}
