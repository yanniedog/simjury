import { useEffect, useState } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { phaseNarratorCue } from '../../lib/narratorCues'
import { StatementCard } from './OpeningStatements'
import { NarratorCue } from './NarratorCue'

export type Verdict = DocketCase['verdict_truth']

/** Closing arguments before the jury retires. The player's lock happens after deliberation. */
export function DocketVerdict({
  trial,
  narration,
  playbackRate,
  onContinue,
}: {
  trial: DocketCase
  narration: boolean
  playbackRate: NarrationRate
  onContinue: () => void
}) {
  const { prosecution, defence } = trial.statements.closing
  const phaseCue = phaseNarratorCue('closings')
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  useEffect(() => {
    if (!narration) {
      setActiveSpeaker(null)
      return stopSpeech
    }
    speak(phaseCue, 'narrator', () => {
      speakAll([
        { text: prosecution.text, key: prosecution.speaker },
        { text: defence.text, key: defence.speaker },
      ], {
        rate: playbackRate,
        onLine: setActiveSpeaker,
        done: () => setActiveSpeaker(null),
      })
    }, playbackRate)
    return stopSpeech
  }, [phaseCue, prosecution.text, prosecution.speaker, defence.text, defence.speaker, narration, playbackRate])

  return (
    <div className="phase-view verdict-view space-y-6">
      <div className="phase-heading space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Closing arguments
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          The last word from each side
        </h1>
      </div>

      <NarratorCue text={phaseCue} />

      {activeSpeaker && (
        <p className="speaker-focus text-xs text-amber-200/80" aria-live="polite">
          {(trial.cast.find((m) => m.id === activeSpeaker)?.name ?? 'Counsel')} is speaking
        </p>
      )}

      <StatementCard trial={trial} statement={prosecution} side="prosecution" />
      <StatementCard trial={trial} statement={defence} side="defence" />

      <p className="text-center text-sm leading-relaxed text-neutral-400">
        The court will retire you to deliberate with the other jurors. You lock your
        own verdict after that discussion — not before.
      </p>

      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        Retire to the jury room →
      </button>
    </div>
  )
}
