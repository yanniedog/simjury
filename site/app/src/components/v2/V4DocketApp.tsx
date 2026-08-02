import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { DocketSitting, DocketSittingV4 } from '../../lib/v2/cases'
import type { ClientDeliberationPack, V4PostVerdictPayload } from '../../lib/v2/caseBundles'
import type { RoomOutcome } from '../../engine/deliberationV5'
import type { V5RoomSession } from '../../engine/v5RoomSession'
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
import {
  completePlay,
  loadPlayForSitting,
  loadProgress,
  saveProgress,
} from '../../lib/storage'
import { upsertPlayerNote, type SittingNote } from '../../lib/jurorNotes'
import { DocketIntro } from './DocketIntro'
import { OpeningStatements } from './OpeningStatements'
import { DocketBeatView } from './DocketBeatView'
import { DocketVerdict } from './DocketVerdict'
import type { Verdict } from './DocketVerdict'
import { DocketShell, DocketSittingChooser } from './DocketChrome'
import { V4JuryRoom } from './V4JuryRoom'
import { V4Reveal } from './V4Reveal'

type V4Phase = 'intro' | 'openings' | 'beats' | 'closings' | 'juryroom' | 'reveal'
type PersistedV4Phase = Exclude<V4Phase, 'intro' | 'reveal'>
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

export function V4LazyBoundary({
  label,
  status,
  onRetry,
}: {
  label: 'jury room' | 'verdict analysis'
  status: PackStatus
  onRetry: () => void
}) {
  return (
    <div className="phase-view space-y-4 text-center">
      <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
        {status === 'error' ? `The ${label} could not be opened` : `Opening the ${label}`}
      </h1>
      <p role={status === 'error' ? 'alert' : 'status'} className="mx-auto max-w-xl text-sm leading-relaxed text-neutral-400">
        {status === 'error'
          ? 'The revision-bound file failed verification. Nothing later in the case has been exposed.'
          : 'Checking this sitting’s revision-bound files…'}
      </p>
      {status === 'error' && (
        <button type="button" onClick={onRetry} className="rounded-lg border border-neutral-600 px-4 py-2 font-semibold text-neutral-200">
          Try again
        </button>
      )}
    </div>
  )
}

/** V4 route. Answer-key analysis stays behind the sealed-verdict boundary. */
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
  const storedPlay = useMemo(
    () => loadPlayForSitting(sitting.day, caseId),
    [caseId, sitting.day],
  )
  const stored = useMemo(() => loadProgress(sitting.day), [sitting.day])
  const valid = stored?.caseId === caseId && stored.beatIndex < trial.beats.length
    ? stored
    : null
  const resumedPhase = storedPlay?.room
    ? 'reveal'
    : valid && RESUMABLE_PHASES.has(valid.phase)
      ? valid.phase
      : 'intro'
  const [phase, setPhase] = useState<V4Phase>(resumedPhase)
  const [beatIndex, setBeatIndex] = useState(valid?.beatIndex ?? 0)
  const [notes, setNotes] = useState<SittingNote[]>(valid?.notes ?? [])
  const [packStatus, setPackStatus] = useState<PackStatus>('idle')
  const [pack, setPack] = useState<ClientDeliberationPack | null>(null)
  const [packAttempt, setPackAttempt] = useState(0)
  const [postStatus, setPostStatus] = useState<PackStatus>('idle')
  const [postVerdict, setPostVerdict] = useState<V4PostVerdictPayload | null>(null)
  const [postAttempt, setPostAttempt] = useState(0)
  const [playerVerdict, setPlayerVerdict] = useState<Verdict | null>(storedPlay?.verdict ?? null)
  const [roomOutcome, setRoomOutcome] = useState<RoomOutcome | null>(() => {
    const room = storedPlay?.room
    return room ? {
      kind: room.kind,
      verdict: room.verdict === 'guilty' ? 'G' : room.verdict === 'not_guilty' ? 'NG' : null,
      tally: { g: room.g, ng: room.ng, u: room.u },
    } : null
  })
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
    if (compatibilityIssue || phase !== 'juryroom') return
    let current = true
    setPackStatus('loading')
    void sitting.loadDeliberationPack().then(
      (loaded) => {
        if (current) {
          setPack(loaded)
          setPackStatus('ready')
        }
      },
      () => { if (current) setPackStatus('error') },
    )
    return () => { current = false }
  }, [compatibilityIssue, packAttempt, phase, sitting])

  useEffect(() => {
    if (compatibilityIssue || phase !== 'reveal') return
    let current = true
    setPostStatus('loading')
    void sitting.loadPostVerdict().then(
      (loaded) => {
        if (current) {
          setPostVerdict(loaded)
          setPostStatus('ready')
        }
      },
      () => { if (current) setPostStatus('error') },
    )
    return () => { current = false }
  }, [compatibilityIssue, phase, postAttempt, sitting])

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

  function sealRoom(session: V5RoomSession, verdict: Verdict) {
    const outcome = session.room.outcome
    if (!outcome) return
    completePlay({
      day: sitting.day,
      caseId,
      convictions: [],
      verdict,
      room: {
        kind: outcome.kind,
        verdict: outcome.verdict === 'G' ? 'guilty' : outcome.verdict === 'NG' ? 'not_guilty' : null,
        g: outcome.tally.g,
        ng: outcome.tally.ng,
        u: outcome.tally.u,
      },
    })
    setPlayerVerdict(verdict)
    setRoomOutcome(outcome)
    setPhase('reveal')
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
      {phase === 'juryroom' && packStatus === 'ready' && pack && (
        <V4JuryRoom
          trial={trial}
          day={sitting.day}
          caseRevision={caseId}
          pack={pack}
          onSeal={sealRoom}
        />
      )}
      {phase === 'juryroom' && packStatus !== 'ready' && (
        <V4LazyBoundary
          label="jury room"
          status={packStatus}
          onRetry={() => {
            setPackStatus('idle')
            setPackAttempt((attempt) => attempt + 1)
          }}
        />
      )}
      {phase === 'reveal' && postStatus === 'ready' && postVerdict && playerVerdict && roomOutcome && (
        <V4Reveal
          trial={trial}
          analysis={postVerdict.analysis}
          playerVerdict={playerVerdict}
          room={roomOutcome}
          dayNumber={sitting.day + 1}
          onChooseAnother={() => onSelect(
            sittings.find(({ day }) => day !== sitting.day)?.day ?? sitting.day,
          )}
        />
      )}
      {phase === 'reveal' && postStatus !== 'ready' && (
        <V4LazyBoundary
          label="verdict analysis"
          status={postStatus}
          onRetry={() => {
            setPostStatus('idle')
            setPostAttempt((attempt) => attempt + 1)
          }}
        />
      )}
    </DocketShell>
  )
}
