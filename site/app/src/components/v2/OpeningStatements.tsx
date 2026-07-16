import { useEffect, useState } from 'react'
import type { DocketCase, Statement } from '../../lib/v2/caseSchema'
import { speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { StoryText } from './CaseMedia'
import { CourtroomStage } from './CourtroomStage'

/**
 * A counsel statement card — the visual voice of one side of the duel.
 * Prosecution reads in the app's guilt colour, defence in its innocence
 * colour, matching the verdict buttons' language.
 */
export function StatementCard({
  trial,
  statement,
  side,
}: {
  trial: DocketCase
  statement: Statement
  side: 'prosecution' | 'defence'
}) {
  const counsel = trial.cast.find((m) => m.id === statement.speaker)
  const tone =
    side === 'prosecution'
      ? 'border-red-900/60 bg-red-950/20'
      : 'border-emerald-900/60 bg-emerald-950/20'
  const nameTone = side === 'prosecution' ? 'text-red-300' : 'text-emerald-300'
  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <p className={`text-sm font-semibold ${nameTone}`}>
        {counsel?.name ?? statement.speaker}
        <span className="ml-2 font-normal text-neutral-500">
          · {counsel?.role_label ?? side}
        </span>
      </p>
      <StoryText text={statement.text} className="mt-3 leading-relaxed text-neutral-100" />
    </div>
  )
}

/**
 * The opening statements phase: both advocates tell their story of the case
 * before any evidence is called — this is where the player decides whose
 * version of these people they believe.
 */
export function OpeningStatements({
  trial,
  narration,
  playbackRate,
  onDone,
}: {
  trial: DocketCase
  narration: boolean
  playbackRate: NarrationRate
  onDone: () => void
}) {
  const { prosecution, defence } = trial.statements.opening
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  // Narrate both openings in their advocates' voices; stop on unmount.
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
          Opening statements
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-xl font-semibold text-neutral-50 focus:outline-none">
          Two accounts. One burden of proof.
        </h1>
      </div>

      <CourtroomStage trial={trial} activeSpeakerId={activeSpeaker} phaseLabel="Opening statements" />

      <StatementCard trial={trial} statement={prosecution} side="prosecution" />
      <StatementCard trial={trial} statement={defence} side="defence" />

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        Call the first witness →
      </button>
    </div>
  )
}
