import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Outcome } from './engine/deliberation'
import { analyzeDocketPlay } from './lib/v2/analyze'
import { docketCaseForDate } from './lib/v2/cases'
import { dayIndex } from './lib/daily'
import { START_CONVICTION } from './lib/game'
import { loadAllPlays, loadPlay, savePlay, type StoredPlay } from './lib/storage'
import { computeStats, type DayResult, type Stats } from './lib/stats'
import { DocketIntro } from './components/v2/DocketIntro'
import { DocketBeatView } from './components/v2/DocketBeatView'
import { DocketVerdict, type Verdict } from './components/v2/DocketVerdict'
import { JuryRoomView } from './components/v2/JuryRoomView'
import { DocketReveal } from './components/v2/DocketReveal'

type Phase = 'intro' | 'beats' | 'verdict' | 'juryroom' | 'reveal'

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 px-5 py-10 text-neutral-100">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  )
}

/** Read the full play history from storage and reduce it to stats. */
function statsFromStorage(): Stats {
  const results: DayResult[] = []
  for (const play of loadAllPlays()) {
    if (play.correct !== undefined) {
      results.push({ day: play.day, correct: play.correct })
    }
  }
  return computeStats(results)
}

export default function App() {
  const today = useMemo(() => new Date(), [])
  const day = useMemo(() => dayIndex(today), [today])
  const trial = useMemo(() => docketCaseForDate(today), [today])
  const stored = useMemo(() => loadPlay(day), [day])

  // Only restore a completed docket play that belongs to the case now assigned
  // to this day (a queue edit can shift which case falls on a day index) and
  // whose check-in trace matches it; anything else starts fresh.
  const validStored = useMemo(() => {
    if (!stored || !trial || !stored.room) return null
    return stored.caseId === trial.id &&
      stored.convictions.length === trial.checkins.length
      ? stored
      : null
  }, [stored, trial])

  const [phase, setPhase] = useState<Phase>(validStored ? 'reveal' : 'intro')
  const [beatIndex, setBeatIndex] = useState(0)
  const [checkinValues, setCheckinValues] = useState<number[]>(
    validStored?.convictions ?? [],
  )
  const [conviction, setConviction] = useState(START_CONVICTION)
  const [verdict, setVerdict] = useState<Verdict | null>(
    validStored?.verdict ?? null,
  )
  const [room, setRoom] = useState<StoredPlay['room'] | null>(
    validStored?.room ?? null,
  )
  const [revealStats, setRevealStats] = useState<Stats | null>(() =>
    validStored ? statsFromStorage() : null,
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

  if (!trial) {
    return (
      <Shell>
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

  function begin() {
    setBeatIndex(0)
    setCheckinValues([])
    setConviction(START_CONVICTION)
    setPhase('beats')
  }

  function nextBeat() {
    const beat = activeTrial.beats[beatIndex]
    if (activeTrial.checkins.includes(beat.id)) {
      // Guarded append: a double-fire can't record the same check-in twice.
      // The cap is the number of check-ins up to and including this beat, not
      // the case total — two queued functional updates in one render cycle
      // would both pass a total-length check.
      const checkinsUpToCurrent = activeTrial.beats
        .slice(0, beatIndex + 1)
        .filter((b) => activeTrial.checkins.includes(b.id)).length
      setCheckinValues((prev) =>
        prev.length >= checkinsUpToCurrent ? prev : [...prev, conviction],
      )
    }
    if (beatIndex + 1 >= beatCount) setPhase('verdict')
    else setBeatIndex(beatIndex + 1)
  }

  function lockVerdict(chosen: Verdict) {
    setVerdict(chosen)
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
    <Shell>
      {phase === 'intro' && (
        <DocketIntro trial={activeTrial} dayNumber={dayNumber} onBegin={begin} />
      )}
      {phase === 'beats' && (
        <DocketBeatView
          trial={activeTrial}
          beatIndex={beatIndex}
          value={conviction}
          onChange={setConviction}
          onNext={nextBeat}
        />
      )}
      {phase === 'verdict' && (
        <DocketVerdict
          trial={activeTrial}
          conviction={conviction}
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
