import { useEffect } from 'react'
import type { DocketCase, Statement } from '../../lib/v2/caseSchema'
import { narrationEnabled, speakAll, stopSpeech } from '../../lib/narration'

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
      <p className="mt-2 leading-relaxed text-neutral-100">{statement.text}</p>
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
  onDone,
}: {
  trial: DocketCase
  onDone: () => void
}) {
  const { prosecution, defence } = trial.statements.opening

  // Narrate both openings in their advocates' voices; stop on unmount.
  useEffect(() => {
    if (!narrationEnabled()) {
      return stopSpeech
    }
    speakAll([
      { text: prosecution.text, key: prosecution.speaker },
      { text: defence.text, key: defence.speaker },
    ])
    return stopSpeech
  }, [prosecution.text, prosecution.speaker, defence.text, defence.speaker])

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Opening statements
        </p>
        <h2 className="text-xl font-semibold text-neutral-50">
          Two accounts. One burden of proof.
        </h2>
      </div>

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
