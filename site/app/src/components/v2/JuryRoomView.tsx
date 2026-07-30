import { useEffect, useRef, useState } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import {
  autoPlayRound,
  finish,
  playRound,
  startDeliberation,
  type DeliberationState,
  type Outcome,
  type PlayerAction,
} from '../../engine/deliberation'
import {
  actionForConcern,
  interpretLegacyConcern,
  type ClaimedPosition,
} from '../../engine/legacyConcernMatcher'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import {
  memoryLabel,
  notesForOwner,
  PLAYER_NOTE_OWNER,
  type SittingNote,
} from '../../lib/jurorNotes'
import {
  phaseNarratorCue,
  REASONABLE_DOUBT_DIRECTION,
} from '../../lib/narratorCues'
import type { Verdict } from './DocketVerdict'
import { JuryBench } from './JuryBench'
import { FeedLine } from './RoomTranscript'
import { RoundStepper } from './RoundStepper'
import type { LiveJurySession } from '../../lib/liveJury'
import { EvidenceIndex } from './EvidenceIndex'
import type { VerdictReflection } from '../../lib/storage'
import { LiveJuryPanel } from './LiveJuryPanel'
import { NarratorCue } from './NarratorCue'

/** Dwell after a round so the transcript is readable and Pause/Raise stay usable. */
const AUTO_DWELL_MS = 850
const AUTO_START_MS = 700

const ROUND_LABEL: Partial<Record<DeliberationState['phase'], string>> = {
  open_1: 'Point 1',
  open_2: 'Point 2',
  open_3: 'Point 3',
}

function floorCopy({
  outcome,
  listening,
  activeLabel,
  awaitingPlayerVote,
  paused,
  raising,
  phase,
}: {
  outcome: Outcome | null
  listening: boolean
  activeLabel: string | null
  awaitingPlayerVote: boolean
  paused: boolean
  raising: boolean
  phase: DeliberationState['phase']
}): string {
  if (outcome) return 'The court has the floor'
  if (listening && activeLabel) return `${activeLabel} has the floor`
  if (listening) return 'The room is answering'
  if (awaitingPlayerVote) return 'Your turn to lock a position'
  if (raising) return 'Raise something if you want — or resume'
  if (paused) return 'Paused — resume when ready, or raise an issue'
  if (phase === 'open_1') return 'The room opens a short agenda'
  if (phase === 'open_2') return 'Next point on the agenda'
  if (phase === 'open_3') return 'Last point before the vote'
  return 'Deliberation continues'
}

export function JuryRoomView({
  trial,
  narration,
  playbackRate,
  notes,
  liveSession,
  onSeal,
  onDone,
}: {
  trial: DocketCase
  narration: boolean
  playbackRate: NarrationRate
  notes: SittingNote[]
  liveSession?: LiveJurySession | null
  onSeal: (outcome: Outcome, verdict: Verdict, reflection?: VerdictReflection) => void
  onDone: (outcome: Outcome, verdict: Verdict) => void
}) {
  const stateRef = useRef<DeliberationState | null>(null)
  stateRef.current ??= startDeliberation(trial)
  const state = stateRef.current
  const [, setTick] = useState(0)
  const [selectedBeat, setSelectedBeat] = useState(trial.beats[0].id)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [playerVerdict, setPlayerVerdict] = useState<Verdict | null>(null)
  const [pendingVerdict, setPendingVerdict] = useState<Verdict | null>(null)
  /** '' = untouched/skip; '__none__' = no single point; else a beat id. */
  const [reflectionChoice, setReflectionChoice] = useState('')
  const [activeJurorId, setActiveJurorId] = useState<string | null>(null)
  const [activeEventTick, setActiveEventTick] = useState<number | null>(null)
  const [narratorActive, setNarratorActive] = useState(false)
  const [liveResponseText, setLiveResponseText] = useState('')
  const [listening, setListening] = useState(false)
  const [paused, setPaused] = useState(false)
  const [raising, setRaising] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesOwner, setNotesOwner] = useState<string | null>(null)
  const [concernText, setConcernText] = useState('')
  const [concernFeedback, setConcernFeedback] = useState<string | null>(null)
  const [pendingClaim, setPendingClaim] = useState<ClaimedPosition | null>(null)
  const [targetJurorId, setTargetJurorId] = useState('')
  const [stirredIds, setStirredIds] = useState<readonly string[]>([])
  const transcriptRef = useRef<HTMLUListElement>(null)
  const followTranscriptRef = useRef(true)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listenGeneration = useRef(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedRef = useRef(false)
  const narrationRef = useRef(narration)
  const pausedRef = useRef(false)
  const raisingRef = useRef(false)
  const outcomeRef = useRef(false)
  narrationRef.current = narration

  const revealVotes = outcome !== null
  const logLength = state.log.length
  const inOpenRound = state.phase.startsWith('open')
  const awaitingPlayerVote = state.phase === 'final_vote' && !outcome
  const beat = trial.beats.find((b) => b.id === selectedBeat)!
  const playerNotes = notesForOwner(notes, PLAYER_NOTE_OWNER)
  const ownersWithNotes = [
    ...(playerNotes.length > 0 ? [PLAYER_NOTE_OWNER] : []),
    ...trial.jury.jurors
      .map((j) => j.id)
      .filter((id) => notesForOwner(notes, id).length > 0),
  ]
  const canReloadNotes = ownersWithNotes.length > 0
  const activeOwner =
    activeJurorId && notesForOwner(notes, activeJurorId).length > 0
      ? activeJurorId
      : null
  const viewingOwner = notesOwner ?? (activeOwner || (playerNotes.length > 0 ? PLAYER_NOTE_OWNER : ownersWithNotes[0] ?? null))
  const viewingNotes = viewingOwner ? notesForOwner(notes, viewingOwner) : []
  const viewingLabel =
    viewingOwner === PLAYER_NOTE_OWNER
      ? 'Your notes'
      : trial.jury.jurors.find((j) => j.id === viewingOwner)?.label ?? 'Notes'

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  useEffect(() => {
    raisingRef.current = raising
  }, [raising])
  useEffect(() => {
    outcomeRef.current = outcome !== null
  }, [outcome])

  function clearAdvanceTimer() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
  }

  function endListening(generation: number) {
    if (listenGeneration.current !== generation) return
    setActiveJurorId(null)
    setActiveEventTick(null)
    setNarratorActive(false)
    setListening(false)
  }

  function scheduleAutoAdvance(delayMs: number) {
    clearAdvanceTimer()
    if (!narrationRef.current) return
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null
      if (
        !narrationRef.current ||
        pausedRef.current ||
        raisingRef.current ||
        outcomeRef.current
      ) return
      const current = stateRef.current
      if (!current?.phase.startsWith('open')) return
      runRound('auto')
    }, delayMs)
  }

  function runRound(mode: 'auto' | PlayerAction) {
    const current = stateRef.current
    if (!current || !current.phase.startsWith('open') || outcomeRef.current) return
    clearAdvanceTimer()
    const before = current.log.length
    setActiveJurorId(null)
    setActiveEventTick(null)
    setNarratorActive(false)
    setPendingVerdict(null)
    setRaising(false)
    raisingRef.current = false
    stopSpeech()
    if (mode === 'auto') autoPlayRound(current)
    else playRound(current, mode)
    const spokenEvents = current.log
      .slice(before)
      .filter((e) => e.type === 'respond' && e.line)
    const spoken = spokenEvents.map((e) => ({ text: e.line!, key: e.actor }))
    setLiveResponseText(narration ? '' : spoken.map(({ text }) => text).join(' '))
    setStirredIds(spoken.map((line) => line.key))
    const generation = ++listenGeneration.current
    const stillOpen = current.phase.startsWith('open')
    if (narration && spoken.length > 0) {
      setListening(true)
      setActiveJurorId(spoken[0]?.key ?? null)
      setActiveEventTick(spokenEvents[0]?.tick ?? null)
      speakAll(spoken, {
        onLine: (key, index) => {
          if (listenGeneration.current === generation) {
            setActiveJurorId(key)
            setActiveEventTick(spokenEvents[index]?.tick ?? null)
          }
        },
        done: () => {
          endListening(generation)
          if (stillOpen && !pausedRef.current && !raisingRef.current) {
            scheduleAutoAdvance(AUTO_DWELL_MS)
          }
        },
        onError: () => endListening(generation),
        rate: playbackRate,
      })
    } else {
      setListening(false)
      setActiveJurorId(null)
      setActiveEventTick(null)
      if (
        narrationRef.current &&
        stillOpen &&
        !pausedRef.current &&
        !raisingRef.current
      ) {
        scheduleAutoAdvance(AUTO_DWELL_MS)
      }
    }
    setTick((t) => t + 1)
  }

  useEffect(() => {
    clearAdvanceTimer()
    setActiveJurorId(null)
    setActiveEventTick(null)
    setNarratorActive(narration)
    setListening(false)
    stopSpeech()
    if (!narration) return stopSpeech
    speak(
      phaseNarratorCue('juryroom'),
      'narrator',
      () => setNarratorActive(false),
      playbackRate,
    )
    if (
      startedRef.current &&
      stateRef.current?.phase.startsWith('open') &&
      !pausedRef.current &&
      !raisingRef.current
    ) {
      scheduleAutoAdvance(AUTO_START_MS)
    }
    return stopSpeech
    // Timer helpers intentionally read current refs; recreating them in this
    // dependency list would restart the room on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration, playbackRate])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    if (narrationRef.current) scheduleAutoAdvance(AUTO_START_MS)
    return () => {
      clearAdvanceTimer()
      stopSpeech()
    }
    // Mount-once autoplay kickoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (awaitingPlayerVote || outcome) headingRef.current?.focus()
  }, [outcome, awaitingPlayerVote])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript && followTranscriptRef.current) {
      transcript.scrollTop = transcript.scrollHeight
    }
  }, [logLength, revealVotes, listening])

  useEffect(() => {
    if (activeEventTick === null) return
    transcriptRef.current
      ?.querySelector<HTMLElement>(`[data-event-tick="${activeEventTick}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeEventTick])

  function togglePause() {
    if (!inOpenRound || outcome) return
    if (paused) {
      setPaused(false)
      pausedRef.current = false
      if (!listening && !raisingRef.current) scheduleAutoAdvance(AUTO_DWELL_MS)
      return
    }
    setPaused(true)
    pausedRef.current = true
    clearAdvanceTimer()
  }

  function openRaise() {
    if (!inOpenRound || outcome || listening) return
    if (narrationRef.current) {
      setPaused(true)
      pausedRef.current = true
    }
    clearAdvanceTimer()
    setRaising(true)
    raisingRef.current = true
  }

  function cancelRaise() {
    setRaising(false)
    raisingRef.current = false
    setConcernFeedback(null)
    setPendingClaim(null)
  }

  function submitConcern(position: ClaimedPosition, useSelected = false) {
    if (!concernText.trim()) {
      setConcernFeedback('Put your concern in your own words first.')
      return
    }
    const claimed = useSelected ? (pendingClaim ?? position) : position
    const targetSeat = trial.jury.jurors.find(({ id }) => id === targetJurorId)?.seat
    const interpreted = interpretLegacyConcern(
      trial,
      notes,
      concernText,
      selectedBeat,
      targetSeat,
    )
    if (interpreted.clarification && !useSelected) {
      setPendingClaim(position)
      setSelectedBeat(interpreted.beatId)
      setConcernFeedback(interpreted.clarification)
      return
    }
    const concern = useSelected
      ? { ...interpreted, beatId: selectedBeat, clarification: null }
      : interpreted
    setSelectedBeat(concern.beatId)
    runRound(actionForConcern(
      trial,
      concern,
      claimed,
      targetJurorId || undefined,
    ))
    setConcernText('')
    setConcernFeedback(null)
    setPendingClaim(null)
  }

  function skipListening() {
    listenGeneration.current += 1
    stopSpeech()
    setActiveJurorId(null)
    setActiveEventTick(null)
    setListening(false)
    if (
      stateRef.current?.phase.startsWith('open') &&
      !pausedRef.current &&
      !raisingRef.current
    ) {
      scheduleAutoAdvance(AUTO_DWELL_MS)
    }
  }

  function sealVerdict(chosen: Verdict) {
    if (state.phase !== 'final_vote' || outcome) return
    clearAdvanceTimer()
    setActiveJurorId(null)
    setActiveEventTick(null)
    setNarratorActive(false)
    setListening(false)
    stopSpeech()
    setPlayerVerdict(chosen)
    const locked = finish(
      state,
      chosen === 'Guilty'
        ? 'guilty'
        : chosen === 'Not Guilty'
          ? 'not_guilty'
          : 'undecided',
    )
    setOutcome(locked)
    const reflection: VerdictReflection | undefined =
      reflectionChoice === ''
        ? undefined
        : reflectionChoice === '__none__'
          ? {}
          : { counterargumentBeatId: reflectionChoice }
    onSeal(locked, chosen, reflection)
    setPendingVerdict(null)
    setReflectionChoice('')
    setStirredIds([])
    setTick((t) => t + 1)
    const judgeLine =
      locked.kind === 'hung'
        ? `The judge reads the result. The jury is hung: ${locked.tally.g} guilty, ${locked.tally.ng} not guilty, and ${locked.tally.u} undecided.`
        : `The judge reads the result. The jury finds ${locked.verdict === 'guilty' ? 'guilty' : 'not guilty'}: ${locked.tally.g} guilty, ${locked.tally.ng} not guilty, and ${locked.tally.u} undecided${locked.kind === 'unanimous' ? ', unanimous' : ', by majority'}.`
    if (narration) speak(judgeLine, 'narrator', undefined, playbackRate)
  }

  function chooseVerdict(chosen: Verdict) {
    if (pendingVerdict === chosen) {
      sealVerdict(chosen)
      return
    }
    setPendingVerdict(chosen)
  }

  const heading = outcome
    ? 'The judge reads the result'
    : awaitingPlayerVote
      ? 'Your position'
      : (ROUND_LABEL[state.phase] ?? 'Deliberation')

  const activeLabel =
    activeJurorId
      ? (trial.jury.jurors.find((juror) => juror.id === activeJurorId)?.label ?? 'A juror')
      : null

  const agendaBeats = state.agenda
    .map((id) => trial.beats.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))

  return (
    <div className="phase-view jury-room-view space-y-5">
      <div className="phase-heading space-y-2 text-center">
        <h1 ref={headingRef} id="phase-heading" tabIndex={-1} className="text-xs uppercase tracking-[0.2em] text-neutral-500 focus:outline-none">
          The jury room · {heading}
        </h1>
        <RoundStepper phase={outcome ? 'final_vote' : state.phase} done={Boolean(outcome)} />
        <p className="text-sm text-neutral-400">
          {outcome
            ? 'The room’s vote is public now.'
            : awaitingPlayerVote
              ? 'Lock your position. The judge then reads the room.'
              : 'Discuss from notes and memory — no transcript in this room.'}
        </p>
      </div>

      {!outcome && !awaitingPlayerVote && !listening && !raising && (
        <NarratorCue text={phaseNarratorCue('juryroom')} active={narratorActive} />
      )}
      {awaitingPlayerVote && <NarratorCue text={phaseNarratorCue('verdict')} />}

      {liveSession && <LiveJuryPanel session={liveSession} trial={trial} />}

      {inOpenRound && !outcome && (
        <div className="deliberation-transport" role="group" aria-label="Deliberation playback">
          {narration ? (
            <button
              type="button"
              onClick={togglePause}
              className="transport-btn"
              aria-pressed={paused}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => runRound('auto')}
              className="transport-btn"
            >
              {state.phase === 'open_1'
                ? 'Hear first point'
                : state.phase === 'open_3'
                  ? 'Hear final point'
                  : 'Continue to next point'}
            </button>
          )}
          <button
            type="button"
            onClick={openRaise}
            disabled={listening || raising}
            className="transport-btn transport-secondary"
          >
            Raise an issue
          </button>
          {canReloadNotes && (
            <button
              type="button"
              onClick={() => {
                setNotesOpen((open) => !open)
                if (!notesOwner) {
                  setNotesOwner(activeOwner ?? ownersWithNotes[0] ?? null)
                }
              }}
              className="transport-btn transport-secondary"
              aria-pressed={notesOpen}
            >
              {notesOpen ? 'Hide notes' : 'Reload notes'}
            </button>
          )}
          {listening && (
            <button type="button" onClick={skipListening} className="transport-btn transport-secondary">
              Skip speech
            </button>
          )}
        </div>
      )}

      {notesOpen && canReloadNotes && viewingOwner && (
        <div className="notes-reload panel border p-4">
          <div className="notes-reload-head">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              Written notes only · {viewingLabel}
            </p>
            {ownersWithNotes.length > 1 && (
              <label className="notes-owner-pick">
                <span className="sr-only">Whose notes</span>
                <select
                  value={viewingOwner}
                  onChange={(event) => setNotesOwner(event.target.value)}
                  className="notes-owner-select"
                >
                  {ownersWithNotes.map((id) => (
                    <option key={id} value={id}>
                      {id === PLAYER_NOTE_OWNER
                        ? 'You (juror 1)'
                        : trial.jury.jurors.find((j) => j.id === id)?.label ?? id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {viewingNotes.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No notes for this juror.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {viewingNotes.map((note) => {
                const memory = memoryLabel(trial, note.beatId)
                return (
                  <li key={`${note.ownerId}-${note.beatId}`} className="note-recall-card">
                    <p className="text-xs text-neutral-500">
                      #{memory.number} · {memory.title}
                    </p>
                    <p className="mt-1 text-sm text-neutral-200">“{note.text}”</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {agendaBeats.length > 0 && inOpenRound && !outcome && (
        <ol className="agenda-strip" aria-label="Discussion agenda">
          {agendaBeats.map((item, i) => {
            const done = state.raisedBeatIds.includes(item.id)
            const speaker =
              trial.cast.find((m) => m.id === item.speaker)?.name ?? 'The record'
            return (
              <li key={item.id} className={`agenda-item${done ? ' done' : ''}`}>
                <span className="agenda-index" aria-hidden="true">{i + 1}</span>
                <span>
                  {item.kind === 'direction' ? 'Legal direction' : speaker}
                  {done ? ' · raised' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <JuryBench
        state={state}
        playerVerdict={playerVerdict}
        activeJurorId={activeJurorId}
        stirredIds={revealVotes ? [] : stirredIds}
        revealPositions={revealVotes}
      />
      <p aria-live="polite" className="speaker-focus text-xs text-amber-200/80">
        {floorCopy({
          outcome,
          listening,
          activeLabel,
          awaitingPlayerVote,
          paused,
          raising,
          phase: state.phase,
        })}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveResponseText}
      </p>

      <ul
        ref={transcriptRef}
        aria-label="Jury room transcript"
        onScroll={(event) => {
          const transcript = event.currentTarget
          followTranscriptRef.current =
            transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 40
        }}
        className="room-transcript max-h-80 space-y-2 overflow-y-auto"
      >
        {state.log.map((e, i) => (
          <FeedLine
            key={i}
            e={e}
            trial={trial}
            notes={notes}
            revealVotes={revealVotes}
            active={e.tick === activeEventTick}
          />
        ))}
      </ul>

      {outcome && playerVerdict ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-center">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              The judge addresses the court
            </p>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">
              {outcome.kind === 'hung'
                ? `Members of the jury, you are unable to agree. The court records a hung jury: ${outcome.tally.g} guilty, ${outcome.tally.ng} not guilty, and ${outcome.tally.u} undecided.`
                : `Members of the jury, by a vote of ${outcome.tally.g} guilty, ${outcome.tally.ng} not guilty, and ${outcome.tally.u} undecided${outcome.kind === 'unanimous' ? ', unanimous' : ''}, you find the accused ${outcome.verdict === 'guilty' ? 'guilty' : 'not guilty'}.`}
            </p>
            <p className="mt-3 text-2xl font-semibold text-neutral-50">
              {outcome.kind === 'hung'
                ? 'Hung jury'
                : outcome.verdict === 'guilty'
                  ? 'Guilty'
                  : 'Not guilty'}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              G {outcome.tally.g} · NG {outcome.tally.ng} · U {outcome.tally.u}
              {outcome.kind === 'majority' && ' · by majority'}
              {outcome.kind === 'unanimous' && ' · unanimous'}
              {' · your vote: '}
              {playerVerdict}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDone(outcome, playerVerdict)}
            className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
          >
            Review the reference verdict →
          </button>
        </div>
      ) : awaitingPlayerVote ? (
        <div className="space-y-4">
          <div className="verdict-threshold border p-4 text-center">
            <p className="text-sm leading-relaxed text-neutral-400">
              {REASONABLE_DOUBT_DIRECTION}
            </p>
          </div>
          <div className="verdict-choices grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              aria-pressed={pendingVerdict === 'Not Guilty'}
              onClick={() => chooseVerdict('Not Guilty')}
              className={`rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-4 font-semibold text-emerald-300 transition hover:bg-emerald-900/40${pendingVerdict === 'Not Guilty' ? ' verdict-pending' : ''}`}
            >
              <span className="block">
                {pendingVerdict === 'Not Guilty' ? 'Tap again to seal' : 'Not persuaded to convict'}
              </span>
              <span className="mt-1 block text-xs font-normal">Verdict: Not guilty</span>
            </button>
            <button
              type="button"
              aria-pressed={pendingVerdict === 'Guilty'}
              onClick={() => chooseVerdict('Guilty')}
              className={`rounded-lg border border-red-800 bg-red-950/40 px-4 py-4 font-semibold text-red-300 transition hover:bg-red-900/40${pendingVerdict === 'Guilty' ? ' verdict-pending' : ''}`}
            >
              <span className="block">
                {pendingVerdict === 'Guilty' ? 'Tap again to seal' : 'Persuaded beyond reasonable doubt'}
              </span>
              <span className="mt-1 block text-xs font-normal">Verdict: Guilty</span>
            </button>
            <button
              type="button"
              aria-pressed={pendingVerdict === 'Undecided'}
              onClick={() => chooseVerdict('Undecided')}
              className={`rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-4 font-semibold text-amber-200 transition hover:bg-amber-900/30${pendingVerdict === 'Undecided' ? ' verdict-pending' : ''}`}
            >
              <span className="block">
                {pendingVerdict === 'Undecided' ? 'Tap again to seal' : 'Unable to decide'}
              </span>
              <span className="mt-1 block text-xs font-normal">Position: Undecided</span>
            </button>
          </div>
          {pendingVerdict && (
            <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Optional · strongest challenge to your position
                </span>
                <select
                  value={reflectionChoice}
                  onChange={(event) => setReflectionChoice(event.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                >
                  <option value="">Skip for now</option>
                  <option value="__none__">No single point</option>
                  {trial.beats.map((b) => {
                    const memory = memoryLabel(trial, b.id)
                    return (
                      <option key={b.id} value={b.id}>
                        #{memory.number} · {memory.title}
                      </option>
                    )
                  })}
                </select>
              </label>
              <p className="text-center text-xs text-neutral-500">
                Permanent for this sitting · tap the same choice again to seal, or choose another position.
              </p>
            </div>
          )}
        </div>
      ) : raising && inOpenRound ? (
        <div className="deliberation-console space-y-3 border p-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Your turn · raise your own concern
          </p>
          <p className="text-sm text-neutral-400">
            Put it in your own words. The room will connect it to the closest
            issue or recollection, ask if it is unsure, and answer the point.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-400">
              Address the room or one juror
            </span>
            <select
              value={targetJurorId}
              onChange={(event) => setTargetJurorId(event.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
            >
              <option value="">The whole room</option>
              {trial.jury.jurors.map((juror) => (
                <option key={juror.id} value={juror.id}>
                  Seat {juror.seat} · {juror.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-neutral-400">
              What do you want them to consider?
            </span>
            <textarea
              value={concernText}
              maxLength={500}
              rows={3}
              onChange={(event) => {
                setConcernText(event.target.value)
                setConcernFeedback(null)
              }}
              placeholder="For example: I don't think the access log proves who held the device."
              className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-relaxed text-neutral-100"
            />
            <span className="block text-right text-xs text-neutral-600">
              {concernText.length}/500
            </span>
          </label>
          {concernFeedback && (
            <div
              role="status"
              className="rounded-lg border border-amber-800/70 bg-amber-950/30 p-3 text-sm text-amber-100"
            >
              {concernFeedback}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Pick the recollection this hangs on
            </p>
            <EvidenceIndex
              trial={trial}
              notes={notes}
              visibleBeatCount={trial.beats.length}
              selectedBeatId={selectedBeat}
              raisedBeatIds={state.raisedBeatIds}
              onSelectBeat={setSelectedBeat}
            />
          </div>
          {concernFeedback ? (
            <button
              type="button"
              onClick={() => submitConcern(pendingClaim ?? 'U', true)}
              className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
            >
              Use selected recollection anyway
            </button>
          ) : beat.kind === 'direction' ? (
            <button
              type="button"
              onClick={() => submitConcern('U')}
              className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
            >
              Raise this legal direction
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => submitConcern('NG')}
                className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
              >
                This raises doubt
              </button>
              <button
                type="button"
                onClick={() => submitConcern('G')}
                className="rounded-lg border border-neutral-600 px-3 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800"
              >
                This supports guilt
              </button>
              <button
                type="button"
                onClick={() => submitConcern('U')}
                className="rounded-lg border border-neutral-600 px-3 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800"
              >
                Ask the room to test it
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={cancelRaise}
            className="w-full rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400 transition hover:bg-neutral-900"
          >
            Never mind — keep the agenda moving
          </button>
        </div>
      ) : null}
    </div>
  )
}
