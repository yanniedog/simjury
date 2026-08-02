import { useEffect, useMemo, useState } from 'react'
import type { ClientDeliberationPack } from '../../lib/v2/caseBundles'
import type { DocketCaseV4 } from '../../lib/v2/caseSchema'
import {
  contributeToV5Session,
  createV5Session,
  sealV5Session,
  type V5RoomSession,
} from '../../engine/v5RoomSession'
import { REQUIRED_DISCUSSION_ROUNDS, type VotePosition } from '../../engine/deliberationV5'
import { loadV5Room, saveV5Room } from '../../lib/v5RoomStorage'
import { jurorSeats } from '../../lib/v2/jurorSeats'
import { JuryBench } from './JuryBench'
import type { Verdict } from './DocketVerdict'

function verdictPosition(verdict: Verdict): VotePosition {
  return verdict === 'Guilty' ? 'G' : verdict === 'Not Guilty' ? 'NG' : 'U'
}

function positionVerdict(position: VotePosition): Verdict {
  return position === 'G' ? 'Guilty' : position === 'NG' ? 'Not Guilty' : 'Undecided'
}

export function V4JuryRoom({
  trial,
  day,
  caseRevision,
  pack,
  onSeal,
}: {
  trial: DocketCaseV4
  day: number
  caseRevision: string
  pack: ClientDeliberationPack
  onSeal: (session: V5RoomSession, verdict: Verdict) => void
}) {
  const [session, setSession] = useState(() =>
    loadV5Room(day, caseRevision) ?? createV5Session(caseRevision, pack))
  const [text, setText] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<string | null>(null)
  const profiles = useMemo(
    () => [...pack.reasoning_profiles].sort((a, b) => a.seat - b.seat),
    [pack],
  )
  const seats = useMemo(() => jurorSeats(trial), [trial])
  const readyToSeal = session.acceptedContributions >= REQUIRED_DISCUSSION_ROUNDS

  useEffect(() => {
    if (session.room.outcome && session.sealedPlayerPosition) {
      onSeal(session, positionVerdict(session.sealedPlayerPosition))
    }
  }, [onSeal, session])

  function contribute() {
    setError(null)
    try {
      const result = contributeToV5Session(session, text, pack)
      setSession(result.session)
      saveV5Room(day, result.session)
      setText('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That point could not be added.')
    }
  }

  function seal() {
    if (!verdict) return setError('Choose your own verdict before the ballot is sealed.')
    setError(null)
    try {
      const sealed = sealV5Session(session, verdictPosition(verdict))
      saveV5Room(day, sealed)
      onSeal(sealed, verdict)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The ballot could not be sealed.')
    }
  }

  return (
    <div className="phase-view space-y-6">
      <header className="space-y-2">
        <p className="chrome-label">Private deliberation</p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          Put the case in your own words
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          Raise {REQUIRED_DISCUSSION_ROUNDS} points before the sealed ballot. The room may
          ask one clarification, but it will not rewrite your position. No juror lean or
          tally is shown before the result is returned.
        </p>
      </header>

      <section aria-labelledby="jury-panel-title" className="space-y-3">
        <h2 id="jury-panel-title" className="text-sm font-semibold text-neutral-200">
          This case&apos;s 12-person jury
        </h2>
        {/* The eleven have authored portraits, names and persuasion styles. The
            bench used to render them as "Seat 3: Nima" in a bordered box, so
            the most engaging asset in the case was not on screen at the moment
            it mattered. No leaning or tally is shown before the result. */}
        <JuryBench seats={seats} activeJurorId={null} />
      </section>

      {session.transcript.length > 0 && (
        <ol aria-label="Jury-room discussion" aria-live="polite" className="space-y-3">
          {session.transcript.map((line) => {
            const speaker = line.kind === 'player'
              ? 'You'
              : line.kind === 'direction'
                ? 'Judge'
                : line.seat
                  ? profiles.find(({ seat }) => seat === line.seat)?.display_name ?? `Seat ${line.seat}`
                  : 'Foreperson'
            return (
              <li key={line.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
                <strong className="text-neutral-200">{speaker}:</strong>{' '}
                <span className="leading-relaxed text-neutral-400">{line.text}</span>
              </li>
            )
          })}
        </ol>
      )}

      {!readyToSeal && (
        <section aria-labelledby="contribution-title" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="contribution-title" className="font-semibold text-neutral-200">
              {session.pendingClarification ? 'Clarify your point' : 'Raise a point'}
            </h2>
            <span className="text-xs text-neutral-500">
              {session.acceptedContributions}/{REQUIRED_DISCUSSION_ROUNDS} discussed
            </span>
          </div>
          {session.pendingClarification && (
            <p role="status" className="rounded border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-200">
              {session.pendingClarification.question}
            </p>
          )}
          <label htmlFor="v4-contribution" className="sr-only">Your contribution</label>
          <textarea
            id="v4-contribution"
            rows={4}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={session.pendingClarification
              ? 'Say which issue or evidence you mean...'
              : `What in ${trial.title} should the jury test?`}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-neutral-100"
          />
          <button type="button" onClick={contribute} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-neutral-950">
            Add to the discussion
          </button>
        </section>
      )}

      {readyToSeal && (
        <section aria-labelledby="verdict-title" className="space-y-4 rounded-lg border border-neutral-700 p-4">
          <div>
            <h2 id="verdict-title" className="font-semibold text-neutral-100">Record your verdict</h2>
            <p className="mt-1 text-sm text-neutral-400">Your choice and the jury ballot are sealed together.</p>
          </div>
          <div role="group" aria-label="Your verdict" className="grid gap-2 sm:grid-cols-3">
            {(['Guilty', 'Not Guilty', 'Undecided'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={verdict === choice}
                onClick={() => setVerdict(choice)}
                className={`rounded-lg border px-3 py-2 ${verdict === choice ? 'border-amber-400 text-amber-300' : 'border-neutral-700 text-neutral-300'}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <button type="button" onClick={seal} className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950">
            Seal verdict and return ballot
          </button>
        </section>
      )}

      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  )
}
