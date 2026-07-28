import { useEffect, useState } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { introSceneNarratorCue, phaseNarratorCue } from '../../lib/narratorCues'
import { contentAdvisoryText } from '../../lib/v2/offenceProfiles'
import { CaseMedia, StoryText } from './CaseMedia'
import { NarratorCue } from './NarratorCue'
import { LiveJuryLobby } from './LiveJuryLobby'
import type { LiveJurySession } from '../../lib/liveJury'

export function DocketIntro({
  trial,
  dayNumber,
  narration,
  playbackRate,
  onBegin,
  liveSession,
  onLiveSession,
}: {
  trial: DocketCase
  dayNumber: number
  narration: boolean
  playbackRate: NarrationRate
  onBegin: () => void
  liveSession?: LiveJurySession | null
  onLiveSession?: (session: LiveJurySession | null) => void
}) {
  const accused = trial.cast.find((m) => m.id === trial.accused.cast_id)
  const [narratorActive, setNarratorActive] = useState(false)
  const phaseCue = phaseNarratorCue('intro')
  const sceneCue = introSceneNarratorCue(trial)
  const advisory = contentAdvisoryText(trial.content_advisories)

  useEffect(() => {
    setNarratorActive(narration)
    if (!narration) return stopSpeech
    speakAll(
      [
        { text: phaseCue, key: 'narrator' },
        { text: sceneCue, key: 'narrator' },
        ...(advisory ? [{ text: advisory, key: 'narrator' }] : []),
        { text: trial.hook, key: 'narrator' },
      ],
      { rate: playbackRate, done: () => setNarratorActive(false) },
    )
    return stopSpeech
  }, [advisory, phaseCue, sceneCue, trial.hook, narration, playbackRate])

  return (
    <div className="phase-view briefing-view space-y-6">
      <div className="phase-heading space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          {dayNumber > 0 ? `The Daily Docket · Case #${dayNumber}` : 'Guided intro'}
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          {trial.title}
        </h1>
        <p className="text-sm text-neutral-400">{trial.setting}</p>
      </div>

      <NarratorCue text={`${phaseCue} ${sceneCue}`} active={narratorActive} />

      {advisory && (
        <aside
          aria-label="Content advisory"
          className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
        >
          {advisory}
        </aside>
      )}

      {trial.media?.cover && <CaseMedia asset={trial.media.cover} priority />}

      <StoryText text={trial.hook} className="border-l-2 border-amber-600 pl-4 text-lg italic leading-relaxed text-neutral-200" />

      <div className="briefing-person space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        {trial.media?.accused && <CaseMedia asset={trial.media.accused} />}
        <div>
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          On trial
        </p>
        <p className="mt-1 font-semibold text-neutral-100">
          {accused?.name ?? trial.accused.cast_id}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">
          {trial.accused.human}
        </p>
        </div>
      </div>

      <div className="briefing-charge rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          The charge
        </p>
        <p className="mt-1 text-neutral-200">{trial.charge}</p>
      </div>

      <div className="proof-elements">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          To convict, the prosecution must prove
        </p>
        <ul className="mt-2 space-y-2">
          {trial.elements.map((element, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-300">
              <span className="text-neutral-600">{i + 1}.</span>
              <span>{element}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm leading-relaxed text-neutral-400">
        {liveSession ? `You have seat ${liveSession.seatId}.` : 'You are Juror #1.'} Hear the evidence, deliberate with the room, then
        lock your verdict for this sitting. The judge reads the jury’s votes
        only after you commit. About fifteen minutes, start to record. Your
        progress stays in this browser.
      </p>

      {onLiveSession && (
        <LiveJuryLobby
          caseId={trial.id}
          session={liveSession ?? null}
          onSession={onLiveSession}
        />
      )}

      <button
        type="button"
        onClick={onBegin}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        Take your seat
      </button>
    </div>
  )
}
