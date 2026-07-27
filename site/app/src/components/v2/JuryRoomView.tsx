import { useEffect, useRef, useState } from 'react'
import type { DocketCase } from '../../lib/v2/caseSchema'
import {
  finish,
  playRound,
  startDeliberation,
  type DeliberationState,
  type Outcome,
  type PlayerAction,
  type RoomEvent,
} from '../../engine/deliberation'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { phaseNarratorCue } from '../../lib/narratorCues'
import type { Verdict } from './DocketVerdict'
import { NarratorCue } from './NarratorCue'

const ROUND_LABEL: Partial<Record<DeliberationState['phase'], string>> = {
  open_1: 'First point',
  open_2: 'Second point',
  open_3: 'Final point',
}

function roundIndex(phase: DeliberationState['phase']): number {
  if (phase === 'open_1') return 0
  if (phase === 'open_2') return 1
  if (phase === 'open_3' || phase === 'mid_vote') return 2
  return 3
}

function usedBeatIds(log: RoomEvent[]): Set<string> {
  const used = new Set<string>()
  for (const e of log) {
    if ((e.type === 'argue' || e.type === 'cite') && e.beatId) used.add(e.beatId)
  }
  return used
}

function RoundStepper({
  phase,
  done,
}: {
  phase: DeliberationState['phase']
  done: boolean
}) {
  const idx = done ? 4 : roundIndex(phase)
  const handsDone = done || phase === 'open_3' || phase === 'final_vote'
  const steps = [
    { key: 'r1', label: '1', title: 'First point', complete: idx > 0, current: idx === 0 },
    { key: 'r2', label: '2', title: 'Second point', complete: idx > 1, current: idx === 1 },
    {
      key: 'hands',
      label: '···',
      title: 'Private hands',
      complete: handsDone,
      current: false,
      soft: true,
    },
    { key: 'r3', label: '3', title: 'Final point', complete: idx > 2, current: idx === 2 },
    { key: 'you', label: 'You', title: 'Your verdict', complete: done, current: idx === 3 && !done },
  ]
  return (
    <ol className="round-stepper" aria-label="Deliberation progress">
      {steps.map((step) => (
        <li
          key={step.key}
          className={`round-step${step.complete ? ' complete' : ''}${step.current ? ' current' : ''}${step.soft ? ' soft' : ''}`}
          aria-current={step.current ? 'step' : undefined}
        >
          <span className="round-step-mark" aria-hidden="true">
            {step.complete && !step.soft ? '✓' : step.label}
          </span>
          <span className="sr-only">{step.title}</span>
        </li>
      ))}
    </ol>
  )
}

function Bench({
  state,
  playerVerdict,
  activeJurorId,
  stirredIds,
  revealPositions,
}: {
  state: DeliberationState
  playerVerdict: Verdict | null
  activeJurorId: string | null
  stirredIds: readonly string[]
  revealPositions: boolean
}) {
  const playerTone = !revealPositions || !playerVerdict
    ? 'border-neutral-700 bg-neutral-900/60 text-neutral-300'
    : playerVerdict === 'Guilty'
      ? 'border-red-800 bg-red-950/40 text-red-300'
      : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
  const playerMark = revealPositions && playerVerdict
    ? (playerVerdict === 'Guilty' ? 'G' : 'NG')
    : '·'
  return (
    <div className="jury-table" role="list" aria-label="The twelve jury seats">
      <div role="listitem" className={`jury-seat player ${playerTone}`}>
        <span className="sr-only">
          {`Seat 1, you${revealPositions && playerVerdict ? `, ${playerVerdict}` : ', deliberating'}`}
        </span>
        <span aria-hidden="true">You</span>
        <small aria-hidden="true">{playerMark}</small>
      </div>
      {[...state.jurors]
        .sort((a, b) => a.seat - b.seat)
        .map((j) => {
          const isActive = j.id === activeJurorId
          const stirred = stirredIds.includes(j.id)
          const lean =
            j.position > 0 ? 'Guilty' : j.position < 0 ? 'Not guilty' : 'Undecided'
          const tone = !revealPositions
            ? `border-neutral-700 bg-neutral-900/40 text-neutral-400${isActive ? ' active' : ''}${stirred ? ' stirred' : ''}`
            : j.position > 0
              ? `border-red-800 bg-red-950/40 text-red-300${isActive ? ' active' : ''}`
              : j.position < 0
                ? `border-emerald-800 bg-emerald-950/40 text-emerald-300${isActive ? ' active' : ''}`
                : `border-amber-700 bg-amber-950/30 text-amber-300${isActive ? ' active' : ''}`
          const mark = !revealPositions
            ? '·'
            : j.position > 0
              ? 'G'
              : j.position < 0
                ? 'NG'
                : '—'
          return (
            <div
              key={j.id}
              role="listitem"
              aria-current={isActive ? 'true' : undefined}
              className={`jury-seat ${tone}`}
              title={j.label}
            >
              <span className="sr-only">
                {`Seat ${j.seat}, ${j.label}${revealPositions ? `, ${lean}` : ''}${isActive ? ', speaking now' : ''}`}
              </span>
              <span aria-hidden="true">{j.seat}</span>
              <small aria-hidden="true">{mark}</small>
            </div>
          )
        })}
    </div>
  )
}

function FeedLine({ e, trial, revealVotes }: { e: RoomEvent; trial: DocketCase; revealVotes: boolean }) {
  if (e.type === 'respond' && e.line) {
    const juror = trial.jury.jurors.find((j) => j.id === e.actor)
    return (
      <li className="room-line border p-3">
        <p className="text-xs font-semibold text-neutral-400">
          {juror?.label ?? e.actor}
        </p>
        <p className="mt-1 text-sm text-neutral-200">{e.line}</p>
      </li>
    )
  }
  if (e.type === 'argue' || e.type === 'cite') {
    const beat = trial.beats.find((b) => b.id === e.beatId)
    const beatNumber = trial.beats.findIndex((b) => b.id === e.beatId) + 1
    const speaker = trial.cast.find((m) => m.id === beat?.speaker)
    const stance =
      e.type === 'cite'
        ? 'You rely on the judge’s legal direction.'
        : e.stance === 'proves'
          ? `You argue that it supports ${beat?.direction === 'guilt' ? 'conviction' : 'acquittal'}.`
          : 'You challenge its reliability.'
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
        <p className="text-xs font-semibold text-neutral-300">You</p>
        <p className="mt-1 text-sm text-neutral-200">{stance}</p>
        <p className="mt-2 border-l border-neutral-600 pl-3 text-xs leading-relaxed text-neutral-400">
          Evidence {beatNumber} · {speaker?.name ?? 'The record'}: “{beat?.text ?? 'The selected evidence'}”
        </p>
      </li>
    )
  }
  if (e.type === 'pass') {
    return (
      <li className="room-pass rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-400">
        You let the room talk — a full round still passes.
      </li>
    )
  }
  if (e.type === 'vote' && e.tally) {
    if (!revealVotes) {
      return (
        <li className="room-hands-sealed rounded-lg border border-neutral-700 bg-neutral-900/70 p-3 text-center text-sm text-neutral-400">
          A private show of hands — sealed until the judge speaks.
        </li>
      )
    }
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-center text-sm text-neutral-300">
        A show of hands: <b className="text-red-300">{e.tally.g} guilty</b> ·{' '}
        <b className="text-emerald-300">{e.tally.ng} not guilty</b>
        {e.tally.u > 0 && <> · {e.tally.u} undecided</>}
      </li>
    )
  }
  if (e.type === 'deadlock_direction' && revealVotes) {
    return (
      <li className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-center text-sm text-amber-200">
        The judge: “{e.detail}”
      </li>
    )
  }
  if (e.type === 'drift_corrected') {
    return (
      <li className="px-3 text-xs italic text-emerald-400">
        You put the burden back where it belongs.
      </li>
    )
  }
  return null
}

function floorCopy({
  outcome,
  listening,
  activeLabel,
  awaitingPlayerVote,
  phase,
  stirCount,
}: {
  outcome: Outcome | null
  listening: boolean
  activeLabel: string | null
  awaitingPlayerVote: boolean
  phase: DeliberationState['phase']
  stirCount: number | null
}): string {
  if (outcome) return 'The court has the floor'
  if (listening && activeLabel) return `${activeLabel} has the floor`
  if (listening) return 'The room is answering'
  if (awaitingPlayerVote) return 'Your turn to lock a verdict'
  if (stirCount !== null && stirCount > 0) {
    return stirCount === 1
      ? 'One juror answered — your move'
      : `${stirCount} jurors answered — your move`
  }
  if (phase === 'open_1') return 'Pick evidence and make your first point'
  if (phase === 'open_2') return 'Make your second point'
  if (phase === 'open_3') return 'One last point before you vote'
  return 'The foreperson waits for your point'
}

export function JuryRoomView({
  trial,
  narration,
  playbackRate,
  onDone,
}: {
  trial: DocketCase
  narration: boolean
  playbackRate: NarrationRate
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
  const [activeJurorId, setActiveJurorId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [stirredIds, setStirredIds] = useState<readonly string[]>([])
  const [stirCount, setStirCount] = useState<number | null>(null)
  const transcriptRef = useRef<HTMLUListElement>(null)
  const followTranscriptRef = useRef(true)
  const continueButton = useRef<HTMLButtonElement>(null)
  const listenGeneration = useRef(0)

  const revealVotes = outcome !== null
  const used = usedBeatIds(state.log)
  const logLength = state.log.length

  useEffect(() => {
    setActiveJurorId(null)
    setListening(false)
    stopSpeech()
    if (!narration) return stopSpeech
    speak(phaseNarratorCue('juryroom'), 'narrator', undefined, playbackRate)
    return stopSpeech
  }, [narration, playbackRate])

  useEffect(() => {
    if (outcome) continueButton.current?.focus()
  }, [outcome])

  const beat = trial.beats.find((b) => b.id === selectedBeat)!
  const inOpenRound = state.phase.startsWith('open')
  const awaitingPlayerVote = state.phase === 'final_vote' && !outcome
  const renderedPhase = state.phase
  const consoleLocked = listening || !inOpenRound

  useEffect(() => {
    document.getElementById('phase-heading')?.focus()
  }, [state.phase, outcome, awaitingPlayerVote])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript && followTranscriptRef.current) {
      transcript.scrollTop = transcript.scrollHeight
    }
  }, [logLength, revealVotes, listening])

  function endListening(generation: number) {
    if (listenGeneration.current !== generation) return
    setActiveJurorId(null)
    setListening(false)
  }

  function skipListening() {
    listenGeneration.current += 1
    stopSpeech()
    setActiveJurorId(null)
    setListening(false)
  }

  function act(action: PlayerAction) {
    if (!inOpenRound || state.phase !== renderedPhase || listening) return
    const before = state.log.length
    setActiveJurorId(null)
    setPendingVerdict(null)
    setStirCount(null)
    stopSpeech()
    playRound(state, action)
    const spoken = state.log
      .slice(before)
      .filter((e) => e.type === 'respond' && e.line)
      .map((e) => ({ text: e.line!, key: e.actor }))
    setStirredIds(spoken.map((line) => line.key))
    setStirCount(spoken.length)
    const generation = ++listenGeneration.current
    if (narration && spoken.length > 0) {
      setListening(true)
      setActiveJurorId(spoken[0]?.key ?? null)
      speakAll(spoken, {
        onLine: (key) => {
          if (listenGeneration.current === generation) setActiveJurorId(key)
        },
        done: () => endListening(generation),
        rate: playbackRate,
      })
    } else {
      setListening(false)
      setActiveJurorId(null)
    }
    setTick((t) => t + 1)
  }

  function sealVerdict(chosen: Verdict) {
    if (state.phase !== 'final_vote' || outcome) return
    setActiveJurorId(null)
    setListening(false)
    stopSpeech()
    setPlayerVerdict(chosen)
    const locked = finish(state, chosen === 'Guilty' ? 'guilty' : 'not_guilty')
    setOutcome(locked)
    setPendingVerdict(null)
    setStirredIds([])
    setTick((t) => t + 1)
    const judgeLine =
      locked.kind === 'hung'
        ? `The judge reads the result. The jury is hung, ${locked.tally.g} to ${locked.tally.ng}.`
        : `The judge reads the result. The jury finds ${locked.verdict === 'guilty' ? 'guilty' : 'not guilty'}, ${locked.tally.g} to ${locked.tally.ng}${locked.kind === 'unanimous' ? ', unanimous' : ', by majority'}.`
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
      ? 'Your verdict'
      : (ROUND_LABEL[state.phase] ?? 'Deliberation')

  const activeLabel =
    activeJurorId
      ? (trial.jury.jurors.find((juror) => juror.id === activeJurorId)?.label ?? 'A juror')
      : null

  const beatSpeaker =
    trial.cast.find((member) => member.id === beat.speaker)?.name ?? 'The record'
  const beatNumber = trial.beats.findIndex((item) => item.id === beat.id) + 1

  return (
    <div className="phase-view jury-room-view space-y-5">
      <div className="phase-heading space-y-2 text-center">
        <h1 id="phase-heading" tabIndex={-1} className="text-xs uppercase tracking-[0.2em] text-neutral-500 focus:outline-none">
          The jury room · {heading}
        </h1>
        {!outcome && !awaitingPlayerVote && (
          <RoundStepper phase={state.phase} done={false} />
        )}
        {awaitingPlayerVote && <RoundStepper phase={state.phase} done={false} />}
        {outcome && <RoundStepper phase="final_vote" done />}
        <p className="text-sm text-neutral-400">
          {outcome
            ? 'The room’s vote is public now.'
            : awaitingPlayerVote
              ? 'Lock your verdict. The judge then reads the room.'
              : 'Three points with the room. Votes stay private until the judge speaks.'}
        </p>
      </div>

      {!outcome && !awaitingPlayerVote && !listening && (
        <NarratorCue text={phaseNarratorCue('juryroom')} />
      )}
      {awaitingPlayerVote && <NarratorCue text={phaseNarratorCue('verdict')} />}

      <Bench
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
          phase: state.phase,
          stirCount: listening ? null : stirCount,
        })}
      </p>

      <ul
        ref={transcriptRef}
        aria-label="Jury room transcript"
        aria-live="polite"
        onScroll={(event) => {
          const transcript = event.currentTarget
          followTranscriptRef.current =
            transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 40
        }}
        className="room-transcript max-h-80 space-y-2 overflow-y-auto"
      >
        {state.log.map((e, i) => (
          <FeedLine key={i} e={e} trial={trial} revealVotes={revealVotes} />
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
                ? `Members of the jury, you are unable to agree. The court records a hung jury, ${outcome.tally.g} guilty to ${outcome.tally.ng} not guilty.`
                : `Members of the jury, by a vote of ${outcome.tally.g} to ${outcome.tally.ng}${outcome.kind === 'unanimous' ? ', unanimous' : ''}, you find the accused ${outcome.verdict === 'guilty' ? 'guilty' : 'not guilty'}.`}
            </p>
            <p className="mt-3 text-2xl font-semibold text-neutral-50">
              {outcome.kind === 'hung'
                ? 'Hung jury'
                : outcome.verdict === 'guilty'
                  ? 'Guilty'
                  : 'Not guilty'}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {outcome.tally.g}–{outcome.tally.ng}
              {outcome.kind === 'majority' && ' · by majority'}
              {outcome.kind === 'unanimous' && ' · unanimous'}
              {' · your vote: '}
              {playerVerdict}
            </p>
          </div>
          <button
            ref={continueButton}
            type="button"
            onClick={() => onDone(outcome, playerVerdict)}
            className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
          >
            See how you did →
          </button>
        </div>
      ) : awaitingPlayerVote ? (
        <div className="space-y-4">
          <div className="verdict-threshold border p-4 text-center">
            <p className="text-sm leading-relaxed text-neutral-400">
              To convict, you must be sure <em>beyond reasonable doubt</em>. Doubt
              alone is enough to acquit.
            </p>
          </div>
          <div className="verdict-choices grid grid-cols-2 gap-3">
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
          </div>
          {pendingVerdict && (
            <p className="text-center text-xs text-neutral-500">
              Permanent for this sitting · tap the same choice again to seal, or pick the other side.
            </p>
          )}
        </div>
      ) : inOpenRound ? (
        <div
          className={`deliberation-console space-y-3 border p-4${consoleLocked ? ' is-listening' : ''}`}
          aria-busy={listening || undefined}
        >
          {listening ? (
            <div className="listen-panel space-y-3 text-center">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Listening to the room
              </p>
              <p className="text-sm text-neutral-300">
                {activeLabel
                  ? `${activeLabel} is speaking.`
                  : 'Jurors are answering your point.'}
              </p>
              <button
                type="button"
                onClick={skipListening}
                className="w-full rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800"
              >
                Skip ahead
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Choose evidence, then argue
              </p>
              <div
                className="evidence-chips"
                role="group"
                aria-label="Evidence from the trial"
              >
                {trial.beats.map((b, i) => {
                  const who = trial.cast.find((m) => m.id === b.speaker)
                  const selected = b.id === selectedBeat
                  const alreadyUsed = used.has(b.id)
                  return (
                    <button
                      key={b.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Evidence ${i + 1}, ${who?.name ?? b.speaker}${alreadyUsed ? ', already raised' : ''}`}
                      onClick={() => setSelectedBeat(b.id)}
                      className={`evidence-chip${selected ? ' selected' : ''}${alreadyUsed ? ' used' : ''}`}
                    >
                      <span aria-hidden="true">{i + 1}</span>
                    </button>
                  )
                })}
              </div>
              <div className="evidence-preview rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Evidence {beatNumber} · {beatSpeaker}
                  {beat.kind === 'direction' ? ' · legal direction' : ''}
                  {used.has(beat.id) ? ' · raised before' : ''}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{beat.text}</p>
              </div>
              {beat.kind === 'direction' ? (
                <button
                  type="button"
                  onClick={() => act({ type: 'cite_direction', beatId: beat.id })}
                  className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
                >
                  Cite this direction
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => act({ type: 'argue', beatId: beat.id, stance: 'proves' })}
                    className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
                  >
                    Argue this supports {beat.direction === 'guilt' ? 'conviction' : 'acquittal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => act({ type: 'argue', beatId: beat.id, stance: 'unreliable' })}
                    className="rounded-lg border border-neutral-600 px-3 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800"
                  >
                    Challenge its reliability
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => act({ type: 'pass' })}
                className="w-full rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-400 transition hover:bg-neutral-900"
              >
                Pass — let the room talk this round
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
