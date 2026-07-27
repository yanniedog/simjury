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
  open_1: 'Round 1 of 3',
  open_2: 'Round 2 of 3',
  open_3: 'Final round',
}

function Bench({
  state,
  playerVerdict,
  activeJurorId,
  revealPositions,
}: {
  state: DeliberationState
  playerVerdict: Verdict | null
  activeJurorId: string | null
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
          const lean =
            j.position > 0 ? 'Guilty' : j.position < 0 ? 'Not guilty' : 'Undecided'
          const tone = !revealPositions
            ? `border-neutral-700 bg-neutral-900/40 text-neutral-400${isActive ? ' active' : ''}`
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
    return <li className="px-3 text-xs italic text-neutral-500">You let the room talk.</li>
  }
  if (e.type === 'vote' && e.tally && revealVotes) {
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
  const transcriptRef = useRef<HTMLUListElement>(null)
  const followTranscriptRef = useRef(true)
  const confirmDialog = useRef<HTMLDialogElement>(null)
  const sealButton = useRef<HTMLButtonElement>(null)

  const revealVotes = outcome !== null

  useEffect(() => {
    setActiveJurorId(null)
    stopSpeech()
    if (!narration) return stopSpeech
    speak(phaseNarratorCue('juryroom'), 'narrator', undefined, playbackRate)
    return stopSpeech
  }, [narration, playbackRate])

  useEffect(() => {
    const dialog = confirmDialog.current
    if (!dialog) return
    if (pendingVerdict) {
      if (!dialog.open) dialog.showModal()
      sealButton.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [pendingVerdict])

  const beat = trial.beats.find((b) => b.id === selectedBeat)!
  const inOpenRound = state.phase.startsWith('open')
  const awaitingPlayerVote = state.phase === 'final_vote' && !outcome
  const renderedPhase = state.phase

  useEffect(() => {
    document.getElementById('phase-heading')?.focus()
  }, [state.phase, outcome, awaitingPlayerVote])

  const logLength = state.log.length
  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript && followTranscriptRef.current) {
      transcript.scrollTop = transcript.scrollHeight
    }
  }, [logLength, revealVotes])

  function act(action: PlayerAction) {
    if (!inOpenRound || state.phase !== renderedPhase) return
    const before = state.log.length
    setActiveJurorId(null)
    stopSpeech()
    playRound(state, action)
    const spoken = state.log
      .slice(before)
      .filter((e) => e.type === 'respond' && e.line)
      .map((e) => ({ text: e.line!, key: e.actor }))
    setActiveJurorId(spoken[0]?.key ?? null)
    speakAll(spoken, {
      onLine: setActiveJurorId,
      done: () => setActiveJurorId(null),
      rate: playbackRate,
    })
    setTick((t) => t + 1)
  }

  function sealVerdict(chosen: Verdict) {
    if (state.phase !== 'final_vote' || outcome) return
    setActiveJurorId(null)
    stopSpeech()
    setPlayerVerdict(chosen)
    const locked = finish(state, chosen === 'Guilty' ? 'guilty' : 'not_guilty')
    setOutcome(locked)
    setPendingVerdict(null)
    setTick((t) => t + 1)
    const judgeLine =
      locked.kind === 'hung'
        ? `The judge reads the result. The jury is hung, ${locked.tally.g} to ${locked.tally.ng}.`
        : `The judge reads the result. The jury finds ${locked.verdict === 'guilty' ? 'guilty' : 'not guilty'}, ${locked.tally.g} to ${locked.tally.ng}${locked.kind === 'unanimous' ? ', unanimous' : ', by majority'}.`
    if (narration) speak(judgeLine, 'narrator', undefined, playbackRate)
  }

  const heading = outcome
    ? 'The judge reads the result'
    : awaitingPlayerVote
      ? 'Your verdict'
      : (ROUND_LABEL[state.phase] ?? 'The vote')

  return (
    <div className="phase-view jury-room-view space-y-5">
      <div className="phase-heading space-y-1 text-center">
        <h1 id="phase-heading" tabIndex={-1} className="text-xs uppercase tracking-[0.2em] text-neutral-500 focus:outline-none">
          The jury room · {heading}
        </h1>
        <p className="text-sm text-neutral-400">
          {outcome
            ? 'Votes stay private until the court announces them.'
            : awaitingPlayerVote
              ? 'Deliberation is finished. Lock your verdict before the judge reads the room.'
              : 'Argue the evidence with the room. Votes stay private until the judge reads them out.'}
        </p>
      </div>

      {!outcome && !awaitingPlayerVote && <NarratorCue text={phaseNarratorCue('juryroom')} />}
      {awaitingPlayerVote && <NarratorCue text={phaseNarratorCue('verdict')} />}

      <Bench
        state={state}
        playerVerdict={playerVerdict}
        activeJurorId={activeJurorId}
        revealPositions={revealVotes}
      />
      <p aria-live="polite" className="speaker-focus text-xs text-amber-200/80">
        {outcome
          ? 'The court has the floor'
          : activeJurorId
            ? `${trial.jury.jurors.find((juror) => juror.id === activeJurorId)?.label ?? 'A juror'} has the floor`
            : awaitingPlayerVote
              ? 'The foreperson asks for your vote'
              : 'The foreperson opens deliberations'}
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
            type="button"
            onClick={() => onDone(outcome, playerVerdict)}
            className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
          >
            Open the authored case record →
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
              onClick={() => setPendingVerdict('Not Guilty')}
              className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-4 font-semibold text-emerald-300 transition hover:bg-emerald-900/40"
            >
              <span className="block">Not persuaded to convict</span>
              <span className="mt-1 block text-xs font-normal">Verdict: Not guilty</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingVerdict('Guilty')}
              className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-4 font-semibold text-red-300 transition hover:bg-red-900/40"
            >
              <span className="block">Persuaded beyond reasonable doubt</span>
              <span className="mt-1 block text-xs font-normal">Verdict: Guilty</span>
            </button>
          </div>
          <dialog
            ref={confirmDialog}
            onClose={() => setPendingVerdict(null)}
            className="verdict-dialog"
            aria-labelledby="verdict-confirm-title"
          >
            <p className="chrome-label">Seal the record</p>
            <h2 id="verdict-confirm-title">Your verdict: {pendingVerdict}</h2>
            <p>
              This decision is permanent for this sitting. The judge will then read
              how the rest of the jury voted.
            </p>
            <div>
              <button type="button" onClick={() => confirmDialog.current?.close()}>
                Review again
              </button>
              <button
                ref={sealButton}
                type="button"
                onClick={() => {
                  if (!pendingVerdict) return
                  sealVerdict(pendingVerdict)
                }}
              >
                Seal my verdict
              </button>
            </div>
          </dialog>
        </div>
      ) : inOpenRound ? (
        <div className="deliberation-console space-y-3 border p-4">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Make your point
          </p>
          <select
            value={selectedBeat}
            onChange={(e) => setSelectedBeat(e.target.value)}
            aria-label="Choose a piece of evidence"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
          >
            {trial.beats.map((b, i) => {
              const who = trial.cast.find((m) => m.id === b.speaker)
              return (
                <option key={b.id} value={b.id}>
                  {i + 1}. {who?.name ?? b.speaker} — {b.text.slice(0, 48)}…
                </option>
              )
            })}
          </select>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Evidence {trial.beats.findIndex((item) => item.id === beat.id) + 1} ·{' '}
              {trial.cast.find((member) => member.id === beat.speaker)?.name ?? 'The record'}
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
            Say nothing this round
          </button>
        </div>
      ) : null}
    </div>
  )
}
