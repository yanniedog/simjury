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
import { speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import type { Verdict } from './DocketVerdict'

const ROUND_LABEL: Partial<Record<DeliberationState['phase'], string>> = {
  open_1: 'Round 1 of 3',
  open_2: 'Round 2 of 3',
  open_3: 'Final round',
}

function positionTone(position: number): string {
  if (position > 0) return 'border-red-800 bg-red-950/40 text-red-300'
  if (position < 0) return 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
  return 'border-amber-700 bg-amber-950/30 text-amber-300'
}

function Bench({
  state,
  playerVerdict,
  activeJurorId,
}: {
  state: DeliberationState
  playerVerdict: Verdict
  activeJurorId: string | null
}) {
  const playerTone =
    playerVerdict === 'Guilty'
      ? 'border-red-800 bg-red-950/40 text-red-300'
      : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
  return (
    <div className="grid grid-cols-6 gap-1.5">
      <div
        className={`rounded border px-1 py-1.5 text-center text-[0.65rem] font-semibold ${playerTone}`}
        title={`You — ${playerVerdict}`}
      >
        You
      </div>
      {[...state.jurors]
        .sort((a, b) => a.seat - b.seat)
        .map((j) => {
          const isActive = j.id === activeJurorId
          return (
            <div
              key={j.id}
              aria-current={isActive ? 'true' : undefined}
              className={`rounded border px-1 py-1.5 text-center text-[0.65rem] ${positionTone(j.position)} ${isActive ? 'ring-2 ring-amber-300 ring-offset-1 ring-offset-neutral-950' : ''}`}
              title={`${j.label}${isActive ? ' — speaking now' : ''}`}
            >
              {j.seat}
              {isActive && <span className="sr-only">, speaking now</span>}
            </div>
          )
        })}
    </div>
  )
}

function FeedLine({ e, trial }: { e: RoomEvent; trial: DocketCase }) {
  if (e.type === 'respond' && e.line) {
    const juror = trial.jury.jurors.find((j) => j.id === e.actor)
    return (
      <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
        <p className="text-xs font-semibold text-neutral-400">
          {juror?.label ?? e.actor}
          {e.delta !== undefined && e.delta !== 0 && (
            <span className={e.delta > 0 ? 'ml-2 text-red-400' : 'ml-2 text-emerald-400'}>
              {e.delta > 0 ? '→ guilty' : '→ not guilty'}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-neutral-200">{e.line}</p>
      </li>
    )
  }
  if (e.type === 'argue' || e.type === 'cite') {
    const beat = trial.beats.find((b) => b.id === e.beatId)
    const speaker = trial.cast.find((m) => m.id === beat?.speaker)
    const what = e.type === 'cite' ? 'You cite the direction from' : 'You point back to'
    const how =
      e.type === 'cite' ? '' : e.stance === 'proves' ? ' — “this proves it.”' : ' — “this can’t be trusted.”'
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
        <p className="text-xs font-semibold text-neutral-300">You</p>
        <p className="mt-1 text-sm text-neutral-200">
          {what} {speaker?.name ?? 'the record'}{how}
        </p>
      </li>
    )
  }
  if (e.type === 'pass') {
    return <li className="px-3 text-xs italic text-neutral-500">You let the room talk.</li>
  }
  if (e.type === 'vote' && e.tally) {
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-center text-sm text-neutral-300">
        A show of hands: <b className="text-red-300">{e.tally.g} guilty</b> ·{' '}
        <b className="text-emerald-300">{e.tally.ng} not guilty</b>
        {e.tally.u > 0 && <> · {e.tally.u} undecided</>}
      </li>
    )
  }
  if (e.type === 'deadlock_direction') {
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
  playerVerdict,
  narration,
  playbackRate,
  onDone,
}: {
  trial: DocketCase
  playerVerdict: Verdict
  narration: boolean
  playbackRate: NarrationRate
  onDone: (outcome: Outcome) => void
}) {
  const stateRef = useRef<DeliberationState | null>(null)
  stateRef.current ??= startDeliberation(
    trial,
    playerVerdict === 'Guilty' ? 'guilty' : 'not_guilty',
  )
  const state = stateRef.current
  const [, setTick] = useState(0)
  const [selectedBeat, setSelectedBeat] = useState(trial.beats[0].id)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [activeJurorId, setActiveJurorId] = useState<string | null>(null)

  // Rate/toggle changes cancel speech in App; clear its visual state here too.
  // The cleanup also prevents narration overlapping the reveal on unmount.
  useEffect(() => {
    setActiveJurorId(null)
    stopSpeech()
    return stopSpeech
  }, [narration, playbackRate])

  const beat = trial.beats.find((b) => b.id === selectedBeat)!
  const inOpenRound = state.phase.startsWith('open')
  // The phase this render was painted for. `state` is mutable, so a rapid
  // double-click would re-enter act() after playRound already advanced the
  // phase — burning a second round on the same action, or throwing once the
  // room reaches final_vote. A stale click (live phase != rendered phase) is
  // simply ignored; the re-render re-arms the buttons for the new round.
  const renderedPhase = state.phase

  // Internal deliberation rounds do not change App's outer phase, so restore
  // focus here as the round heading changes for keyboard and screen-reader users.
  useEffect(() => {
    document.getElementById('phase-heading')?.focus()
  }, [state.phase])

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

  function callVote() {
    // Same double-click hazard as act(): finish() throws once the phase has
    // left final_vote, so a second click before re-render must be a no-op.
    if (state.phase !== 'final_vote') return
    setActiveJurorId(null)
    stopSpeech()
    setOutcome(finish(state))
    setTick((t) => t + 1)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h1 id="phase-heading" tabIndex={-1} className="text-xs uppercase tracking-[0.2em] text-neutral-500 focus:outline-none">
          The jury room · {ROUND_LABEL[state.phase] ?? 'The vote'}
        </h1>
        <p className="text-sm text-neutral-400">
          Your verdict is sealed for this sitting. Now explain what persuaded you.
        </p>
        <p className="text-xs text-neutral-600">
          This is a deterministic room of fictional jurors—not live people or AI.
        </p>
      </div>

      <Bench state={state} playerVerdict={playerVerdict} activeJurorId={activeJurorId} />
      <p aria-live="polite" className="min-h-4 text-center text-xs text-amber-200/80">
        {activeJurorId
          ? `${trial.jury.jurors.find((juror) => juror.id === activeJurorId)?.label ?? 'A juror'} has the floor`
          : 'The foreperson opens deliberations'}
      </p>

      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {state.log.map((e, i) => (
          <FeedLine key={i} e={e} trial={trial} />
        ))}
      </ul>

      {outcome ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-5 text-center">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              The room returns
            </p>
            <p className="mt-1 text-2xl font-semibold text-neutral-50">
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
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDone(outcome)}
            className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
          >
            See what really happened →
          </button>
        </div>
      ) : inOpenRound ? (
        <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
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
          {beat.kind === 'direction' ? (
            <button
              type="button"
              onClick={() => act({ type: 'cite_direction', beatId: beat.id })}
              className="w-full rounded-lg bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
            >
              ⚖️ Cite this direction
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => act({ type: 'argue', beatId: beat.id, stance: 'proves' })}
                className="rounded-lg bg-neutral-100 px-3 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-white"
              >
                This proves it
              </button>
              <button
                type="button"
                onClick={() => act({ type: 'argue', beatId: beat.id, stance: 'unreliable' })}
                className="rounded-lg border border-neutral-600 px-3 py-2.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-800"
              >
                Can’t be trusted
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
      ) : (
        <button
          type="button"
          onClick={callVote}
          className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
        >
          The foreperson calls the vote
        </button>
      )}
    </div>
  )
}
