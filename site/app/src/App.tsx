import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Outcome } from './engine/deliberation'
import { analyzeDocketPlay } from './lib/v2/analyze'
import { docketCaseForDate } from './lib/v2/cases'
import { dayIndex } from './lib/daily'
import { START_CONVICTION } from './lib/game'
import {
  clearProgress,
  loadAllPlays,
  loadPlay,
  loadProgress,
  savePlay,
  saveProgress,
  type StoredProgress,
  type StoredPlay,
} from './lib/storage'
import { computeStats, type DayResult, type Stats } from './lib/stats'
import {
  narrationEnabled,
  narrationSupported,
  setNarrationEnabled,
} from './lib/narration'
import { DocketIntro } from './components/v2/DocketIntro'
import { OpeningStatements } from './components/v2/OpeningStatements'
import { DocketBeatView } from './components/v2/DocketBeatView'
import { DocketVerdict, type Verdict } from './components/v2/DocketVerdict'
import { JuryRoomView } from './components/v2/JuryRoomView'
import { DocketReveal } from './components/v2/DocketReveal'

type Phase = 'intro' | 'openings' | 'beats' | 'verdict' | 'juryroom' | 'reveal'

function Shell({
  children,
  narration,
  onToggleNarration,
}: {
  children: ReactNode
  narration: boolean
  onToggleNarration: () => void
}) {
  return (
    <main className="docket-shell min-h-screen px-5 pb-12 text-neutral-100">
      <a href="#phase-heading" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Skip to the case
      </a>
      <div className="mx-auto w-full max-w-md">
        <div className="sticky top-0 z-20 -mx-2 mb-8 flex items-center justify-between border-b border-white/10 bg-neutral-950/85 px-2 py-4 text-xs uppercase tracking-wider text-neutral-400 backdrop-blur">
          <a href="/" className="font-semibold text-neutral-300 hover:text-white">SimJury</a>
          {narrationSupported() && (
            <button type="button" aria-pressed={narration} onClick={onToggleNarration} className="rounded-full border border-amber-500/40 px-3 py-2 text-amber-100 hover:bg-amber-500/10">
              Natural voice {narration ? 'on' : 'off'}
            </button>
          )}
        </div>
        {children}
      </div>
    </main>
  )
}

/** Read the full play history from storage and reduce it to stats. */
function statsFromStorage(): Stats {
  const results: DayResult[] = []
  for (const play of loadAllPlays()) {
    if (play.room) {
      results.push({ day: play.day })
    }
  }
  return computeStats(results)
}

export default function App() {
  const [narration, setNarration] = useState(narrationEnabled())
  const today = useMemo(() => new Date(), [])
  const day = useMemo(() => dayIndex(today), [today])
  const trial = useMemo(() => docketCaseForDate(today), [today])
  const stored = useMemo(() => loadPlay(day), [day])
  const progress = useMemo(() => loadProgress(day), [day])

  // Only restore a stored play that belongs to the case now assigned to this
  // day (a queue edit can shift which case falls on a day index) and whose
  // check-in trace matches it; anything else starts fresh. A play with a room
  // result is complete (restore at reveal); one without is a verdict locked
  // before the jury room finished (restore at the room — the lock is
  // permanent, so a refresh must not allow a fresh verdict).
  const validStored = useMemo(() => {
    if (!stored || !trial) return null
    return stored.caseId === trial.id &&
      stored.convictions.length === trial.checkins.length
      ? stored
      : null
  }, [stored, trial])

  const validProgress = useMemo(() => {
    if (!progress || !trial || validStored) return null
    if (progress.caseId !== trial.id || progress.beatIndex >= trial.beats.length) return null
    const completedBeatCount =
      progress.phase === 'verdict' ? progress.beatIndex + 1 : progress.beatIndex
    const expectedCheckins = trial.beats
      .slice(0, completedBeatCount)
      .filter((beat) => trial.checkins.includes(beat.id)).length
    if (progress.checkinValues.length !== expectedCheckins) return null
    return progress
  }, [progress, trial, validStored])

  const [phase, setPhase] = useState<Phase>(
    validStored
      ? (validStored.room ? 'reveal' : 'juryroom')
      : (validProgress?.phase ?? 'intro'),
  )
  const [beatIndex, setBeatIndex] = useState(validProgress?.beatIndex ?? 0)
  const [checkinValues, setCheckinValues] = useState<number[]>(
    validStored?.convictions ?? validProgress?.checkinValues ?? [],
  )
  const [conviction, setConviction] = useState(
    validProgress?.conviction ?? START_CONVICTION,
  )
  const [verdict, setVerdict] = useState<Verdict | null>(
    validStored?.verdict ?? null,
  )
  const [room, setRoom] = useState<StoredPlay['room'] | null>(
    validStored?.room ?? null,
  )
  const [revealStats, setRevealStats] = useState<Stats | null>(() =>
    validStored?.room ? statsFromStorage() : null,
  )

  const analysis = useMemo(
    () =>
      trial && verdict ? analyzeDocketPlay(trial, checkinValues, verdict) : null,
    [trial, checkinValues, verdict],
  )

  // A tab left open across local midnight would otherwise keep showing (and
  // let the player finish) yesterday's case forever, since `today` is only
  // ever computed once at mount. Poll for a day rollover — and check again
  // whenever the tab regains focus, in case the interval was throttled while
  // backgrounded — and reload so the player always lands on today's case.
  useEffect(() => {
    function checkForRollover() {
      if (dayIndex(new Date()) !== day) {
        window.location.reload()
      }
    }
    const id = window.setInterval(checkForRollover, 60_000)
    document.addEventListener('visibilitychange', checkForRollover)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', checkForRollover)
    }
  }, [day])

  useEffect(() => {
    document.getElementById('phase-heading')?.focus()
  }, [phase, beatIndex])

  if (!trial) {
    return (
      <Shell narration={narration} onToggleNarration={toggleNarration}>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">⚖️ SimJury — The Daily Docket</h1>
          <p className="text-neutral-400">
            No case is queued for today. Check back soon.
          </p>
        </div>
      </Shell>
    )
  }

  const activeTrial = trial
  const dayNumber = day + 1
  const beatCount = activeTrial.beats.length

  function toggleNarration() {
    const next = !narration
    setNarrationEnabled(next)
    setNarration(next)
  }

  function persistProgress(
    update: Omit<StoredProgress, 'day' | 'caseId'>,
  ) {
    saveProgress({ day, caseId: activeTrial.id, ...update })
  }

  function begin() {
    setBeatIndex(0)
    setCheckinValues([])
    setConviction(START_CONVICTION)
    setPhase('openings')
    persistProgress({
      phase: 'openings',
      beatIndex: 0,
      checkinValues: [],
      conviction: START_CONVICTION,
    })
  }

  function startEvidence() {
    setPhase('beats')
    persistProgress({
      phase: 'beats',
      beatIndex: 0,
      checkinValues: [],
      conviction: START_CONVICTION,
    })
  }

  function updateConviction(value: number) {
    setConviction(value)
    persistProgress({
      phase: 'beats',
      beatIndex,
      checkinValues,
      conviction: value,
    })
  }

  function nextBeat() {
    const beat = activeTrial.beats[beatIndex]
    let nextCheckins = checkinValues
    if (activeTrial.checkins.includes(beat.id)) {
      // Guarded append: a double-fire can't record the same check-in twice.
      // The cap is the number of check-ins up to and including this beat, not
      // the case total — two queued functional updates in one render cycle
      // would both pass a total-length check.
      const checkinsUpToCurrent = activeTrial.beats
        .slice(0, beatIndex + 1)
        .filter((b) => activeTrial.checkins.includes(b.id)).length
      if (checkinValues.length < checkinsUpToCurrent) {
        nextCheckins = [...checkinValues, conviction]
        setCheckinValues(nextCheckins)
      }
    }
    const atVerdict = beatIndex + 1 >= beatCount
    const nextBeatIndex = atVerdict ? beatIndex : beatIndex + 1
    if (atVerdict) setPhase('verdict')
    else setBeatIndex(nextBeatIndex)
    persistProgress({
      phase: atVerdict ? 'verdict' : 'beats',
      beatIndex: nextBeatIndex,
      checkinValues: nextCheckins,
      conviction,
    })
  }

  function lockVerdict(chosen: Verdict) {
    setVerdict(chosen)
    // Persist the lock before the jury room: the verdict is permanent, so a
    // refresh mid-room must resume at the room, not offer a fresh verdict.
    savePlay({
      day,
      caseId: activeTrial.id,
      convictions: checkinValues,
      verdict: chosen,
    })
    clearProgress(day)
    setPhase('juryroom')
  }

  function roomDone(outcome: Outcome) {
    if (!verdict) return
    const done = analyzeDocketPlay(activeTrial, checkinValues, verdict)
    const roomRecord: NonNullable<StoredPlay['room']> = {
      kind: outcome.kind,
      verdict: outcome.verdict,
      g: outcome.tally.g,
      ng: outcome.tally.ng,
    }
    setRoom(roomRecord)
    savePlay({
      day,
      caseId: activeTrial.id,
      convictions: checkinValues,
      verdict,
      correct: done.correct,
      swayedByTraps: done.trapsSwayed,
      totalTraps: done.totalTraps,
      room: roomRecord,
    })
    setRevealStats(statsFromStorage())
    setPhase('reveal')
  }

  return (
    <Shell narration={narration} onToggleNarration={toggleNarration}>
      {phase === 'intro' && (
        <DocketIntro trial={activeTrial} dayNumber={dayNumber} onBegin={begin} />
      )}
      {phase === 'openings' && (
        <OpeningStatements
          trial={activeTrial}
          narration={narration}
          onDone={startEvidence}
        />
      )}
      {phase === 'beats' && (
        <DocketBeatView
          trial={activeTrial}
          beatIndex={beatIndex}
          value={conviction}
          narration={narration}
          onChange={updateConviction}
          onNext={nextBeat}
        />
      )}
      {phase === 'verdict' && (
        <DocketVerdict
          trial={activeTrial}
          conviction={conviction}
          narration={narration}
          onLock={lockVerdict}
        />
      )}
      {phase === 'juryroom' && verdict && (
        <JuryRoomView
          key={`${activeTrial.id}-${verdict}`}
          trial={activeTrial}
          playerVerdict={verdict}
          onDone={roomDone}
        />
      )}
      {phase === 'reveal' && verdict && analysis && room && revealStats && (
        <DocketReveal
          trial={activeTrial}
          analysis={analysis}
          verdict={verdict}
          room={room}
          dayNumber={dayNumber}
          stats={revealStats}
        />
      )}
    </Shell>
  )
}
