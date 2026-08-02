import { useEffect, useState } from 'react'
import type { CourtroomTrial, Statement } from '../../lib/v2/caseSchema'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { phaseNarratorCue } from '../../lib/narratorCues'
import { StoryText } from './CaseMedia'
import { NarratorCue } from './NarratorCue'
import { SpeakerFlag } from './SpeakerFlag'
import { SpeakerPortrait } from './SpeakerPortrait'

/**
 * A counsel statement card — the visual voice of one side of the duel.
 * Prosecution reads in the app's guilt colour, defence in its innocence
 * colour, matching the verdict buttons' language.
 */
export function StatementCard({
  trial,
  statement,
  side,
  active = false,
}: {
  trial: CourtroomTrial
  statement: Statement
  side: 'prosecution' | 'defence'
  active?: boolean
}) {
  const counsel = trial.cast.find((m) => m.id === statement.speaker)
  const tone = side === 'prosecution' ? 'prosecution' : 'defence'
  const nameTone = side === 'prosecution' ? 'text-red-300' : 'text-emerald-300'
  return (
    <article
      className={`statement-card speech-turn ${tone}${active ? ' speech-turn-active' : ''}`}
      aria-current={active ? 'true' : undefined}
    >
      <div className="flex items-start gap-4">
        <SpeakerPortrait trial={trial} speakerId={statement.speaker} />
        <div className="min-w-0">
          <p className={`speaker-heading text-sm font-semibold ${nameTone}`}>
            <span>
            {counsel?.name ?? statement.speaker}
            <span className="ml-2 font-normal text-neutral-500">
              · {counsel?.role_label ?? side}
            </span>
            </span>
            <SpeakerFlag active={active} />
          </p>
          <StoryText text={statement.text} className="mt-3 leading-relaxed text-neutral-100" />
        </div>
      </div>
    </article>
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
  trial: CourtroomTrial
  narration: boolean
  playbackRate: NarrationRate
  onDone: () => void
}) {
  const { prosecution, defence } = trial.statements.opening
  const phaseCue = phaseNarratorCue('openings')
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  useEffect(() => {
    if (!narration) {
      setActiveSpeaker(null)
      return stopSpeech
    }
    setActiveSpeaker('narrator')
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
    <div className="phase-view openings-view space-y-6">
      <div className="phase-heading space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Opening statements
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          Two accounts. One burden of proof.
        </h1>
      </div>

      <NarratorCue text={phaseCue} active={activeSpeaker === 'narrator'} />

      {activeSpeaker && (
        <p className="speaker-focus text-xs text-amber-200/80" aria-live="polite">
          {activeSpeaker === 'narrator'
            ? 'Narrator'
            : trial.cast.find((m) => m.id === activeSpeaker)?.name ?? 'Counsel'} is speaking
        </p>
      )}

      <StatementCard
        trial={trial}
        statement={prosecution}
        side="prosecution"
        active={activeSpeaker === prosecution.speaker}
      />
      <StatementCard
        trial={trial}
        statement={defence}
        side="defence"
        active={activeSpeaker === defence.speaker}
      />

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
