import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { DocketSitting, DocketSittingV4 } from '../../lib/v2/cases'
import { v4CourtroomCompatibilityIssue } from '../../lib/v2/v4CourtroomCompatibility'
import { caseStorageId } from '../../lib/v2/caseRevision'
import {
  clearNarrationSpeakers,
  narrationEnabled,
  narrationEngine,
  narrationRate,
  setNarrationEnabled,
  setNarrationEngine,
  setNarrationRate,
  setNarrationSpeakers,
  type NarrationEngineId,
  type NarrationRate,
} from '../../lib/narration'
import { loadProgress, saveProgress } from '../../lib/storage'
import { upsertPlayerNote, type SittingNote } from '../../lib/jurorNotes'
import { DocketIntro } from './DocketIntro'
import { OpeningStatements } from './OpeningStatements'
import { DocketBeatView } from './DocketBeatView'
import { DocketVerdict } from './DocketVerdict'
import { DocketShell, DocketSittingChooser } from './DocketChrome'

type V4Phase = 'intro' | 'openings' | 'beats' | 'closings' | 'juryroom'
type PersistedV4Phase = Exclude<V4Phase, 'intro'>
type PackStatus = 'idle' | 'loading' | 'ready' | 'error'
const RESUMABLE_PHASES = new Set<PersistedV4Phase>([
  'openings', 'beats', 'closings', 'juryroom',
])

export function V4JuryRoomUnavailable({ status }: { status: PackStatus }) {
  return (
    <div className="phase-view space-y-5 text-center">
      <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
        This jury room is not open yet
      </h1>
      <p className="mx-auto max-w-xl leading-relaxed text-neutral-300">
        The trial record is complete, but this sitting uses the new authored jury-room
        format. SimJury will not substitute the older hidden-weight room or expose the
        answer key before a verdict.
      </p>
      <p role="status" className="text-sm text-neutral-500">
        {status === 'loading' && 'Checking the revision-bound jury packâ€¦'}
        {status === 'ready' && 'Jury pack verified; the compatible room player is still required.'}
        {status === 'error' && 'The jury pack could not be verified, so the sitting stopped safely.'}
      </p>
    </div>
  )
}

/** V4 courtroom route. It never imports or requests post-verdict analysis. */
export function V4DocketApp({
  sitting,
  sittings,
  featuredSitting,
  onSelect,
  intro,
}: {
  sitting: DocketSittingV4
  sittings: DocketSitting[]
  featuredSitting: DocketSitting | null
  onSelect: (day: number) => void
  intro: DocketSitting | null
}) {
  const { trial } = sitting
  const compatibilityIssue = v4CourtroomCompatibilityIssue(trial)
  const caseId = caseStorageId(trial)
  const stored = useMemo(() => loadProgress(sitting.day), [sitting.day])
  const valid = stored?.caseId === caseId && stored.beatIndex < trial.beats.length
    ? stored
    : null
  const resumedPhase = valid && RESUMABLE_PHASES.has(valid.phase)
    ? valid.phase
    : 'intro'
  const [phase, setPhase] = useState<V4Phase>(resumedPhase)
  const [beatIndex, setBeatIndex] = useState(valid?.beatIndex ?? 0)
  const [notes, setNotes] = useState<SittingNote[]>(valid?.notes ?? [])
  const [packStatus, setPackStatus] = useState<PackStatus>('idle')
  const [narration, setNarration] = useState(narrationEnabled())
  const [playbackRate, setPlaybackRate] = useState(narrationRate())
  const [voiceEngine, setVoiceEngine] = useState(narrationEngine())

  useLayoutEffect(() => {
    setNarrationSpeakers({
      cast: trial.cast.map(({ id, name, role_label }) => ({ id, name, role_label })),
      jurors: trial.jury.jurors.map(({ id, persona, gender }) => ({ id, persona, gender })),
    })
    return clearNarrationSpeakers
  }, [trial])

  useEffect(() => {
    if (compatibilityIssue || phase !== 'juryroom' || packStatus !== 'idle') return
    let current = true
    setPackStatus('loading')
    void sitting.loadDeliberationPack().then(
      () => { if (current) setPackStatus('ready') },
      () => { if (current) setPackStatus('error') },
    )
    return () => { current = false }
  }, [compatibilityIssue, packStatus, phase, sitting])

  function persist(nextPhase: PersistedV4Phase, nextBeat = beatIndex, nextNotes = notes) {
    saveProgress({ day: sitting.day, caseId, phase: nextPhase, beatIndex: nextBeat, notes: nextNotes })
  }

  function changePhase(next: PersistedV4Phase) {
    setPhase(next)
    persist(next)
  }

  function saveNote(beatId: string, text: string) {
    const next = upsertPlayerNote(notes, beatId, text)
    setNotes(next)
    persist('beats', beatIndex, next)
  }

  function nextBeat() {
    if (beatIndex + 1 >= trial.beats.length) return changePhase('closings')
    const next = beatIndex + 1
    setBeatIndex(next)
    persist('beats', next)
  }

  function toggleNarration() {
    const next = !narration
    setNarrationEnabled(next)
    setNarration(next)
  }

  function changeRate(rate: NarrationRate) {
    setPlaybackRate(setNarrationRate(rate))
  }

  function changeEngine(engine: NarrationEngineId) {
    setVoiceEngine(setNarrationEngine(engine))
  }

  if (compatibilityIssue) {
    return (
      <DocketShell
        phase="intro"
        caseTitle={trial.title}
        dayNumber={sitting.day + 1}
        charge={trial.charge}
        narration={narration}
        playbackRate={playbackRate}
        voiceEngine={voiceEngine}
        onToggleNarration={toggleNarration}
        onRateChange={changeRate}
        onVoiceEngineChange={changeEngine}
        sidebar={<DocketSittingChooser sittings={sittings} selectedCaseId={trial.id} featuredSitting={featuredSitting} onSelect={onSelect} introSitting={intro} />}
      >
        <div className="phase-view space-y-5 text-center">
          <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
            This sitting cannot open safely
          </h1>
          <p role="alert" className="mx-auto max-w-xl leading-relaxed text-neutral-300">
            {compatibilityIssue}
          </p>
        </div>
      </DocketShell>
    )
  }

  return (
    <DocketShell
      phase={phase}
      caseTitle={trial.title}
      dayNumber={sitting.day + 1}
      charge={trial.charge}
      narration={narration}
      playbackRate={playbackRate}
      voiceEngine={voiceEngine}
      onToggleNarration={toggleNarration}
      onRateChange={changeRate}
      onVoiceEngineChange={changeEngine}
      sidebar={<DocketSittingChooser sittings={sittings} selectedCaseId={trial.id} featuredSitting={featuredSitting} onSelect={onSelect} introSitting={intro} />}
    >
      {phase === 'intro' && <DocketIntro trial={trial} dayNumber={sitting.day + 1} narration={narration} playbackRate={playbackRate} onBegin={() => changePhase('openings')} />}
      {phase === 'openings' && <OpeningStatements trial={trial} narration={narration} playbackRate={playbackRate} onDone={() => changePhase('beats')} />}
      {phase === 'beats' && <DocketBeatView trial={trial} beatIndex={beatIndex} narration={narration} playbackRate={playbackRate} notes={notes} onNoteChange={saveNote} onNext={nextBeat} />}
      {phase === 'closings' && <DocketVerdict trial={trial} narration={narration} playbackRate={playbackRate} onContinue={() => changePhase('juryroom')} />}
      {phase === 'juryroom' && <V4JuryRoomUnavailable status={packStatus} />}
    </DocketShell>
  )
}
