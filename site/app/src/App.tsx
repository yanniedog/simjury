import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { caseForDate } from './lib/cases'
import { dayIndex } from './lib/daily'
import { START_CONVICTION, analyzePlay, type Phase, type Verdict } from './lib/game'
import { loadAllPlays, loadPlay, savePlay } from './lib/storage'
import { computeStats, type DayResult, type Stats } from './lib/stats'
import { IntroCard } from './components/IntroCard'
import { BeatView } from './components/BeatView'
import { VerdictView } from './components/VerdictView'
import { RevealView } from './components/RevealView'

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
  const trial = useMemo(() => caseForDate(today), [today])
  const stored = useMemo(() => loadPlay(day), [day])

  // Only restore a completed play whose length matches today's case *and* whose
  // caseId matches the case now assigned to this day; otherwise it can't be
  // scored cleanly (or belongs to a case a queue edit has since replaced), so
  // we start fresh.
  const validStored = useMemo(() => {
    if (!stored || !trial) return null
    return stored.convictions.length === trial.beats.length &&
      stored.caseId === trial.id
      ? stored
      : null
  }, [stored, trial])

  const beatCount = trial ? trial.beats.length : 0

  const [phase, setPhase] = useState<Phase>(validStored ? 'reveal' : 'intro')
  const [convictions, setConvictions] = useState<number[]>(
    validStored?.convictions ?? [],
  )
  const [conviction, setConviction] = useState(START_CONVICTION)
  const [verdict, setVerdict] = useState<Verdict | null>(
    validStored?.verdict ?? null,
  )
  // Computed once when a play completes (or on restore), never per render.
  const [revealStats, setRevealStats] = useState<Stats | null>(() =>
    validStored ? statsFromStorage() : null,
  )

  // Play analysis for the reveal, memoized so it isn't recomputed every render.
  const revealAnalysis = useMemo(
    () => (trial && verdict ? analyzePlay(trial, convictions, verdict) : null),
    [trial, convictions, verdict],
  )

  // Once every beat has a recorded conviction, move to the verdict. Deriving the
  // current beat from convictions.length (rather than a second index state)
  // removes any stale-closure risk on rapid submissions.
  useLayoutEffect(() => {
    if (phase === 'beats' && beatCount > 0 && convictions.length >= beatCount) {
      setPhase('verdict')
    }
  }, [phase, convictions, beatCount])

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
          <h1 className="text-2xl font-semibold">⚖️ SimJury Daily</h1>
          <p className="text-neutral-400">
            No case is queued for today. Check back soon.
          </p>
        </div>
      </Shell>
    )
  }

  const activeTrial = trial
  const dayNumber = day + 1
  const currentBeat = Math.min(convictions.length, beatCount - 1)

  function begin() {
    setConvictions([])
    setConviction(START_CONVICTION)
    setPhase('beats')
  }

  function submitBeat() {
    // Guarded append: a double-fire can't push past the last beat.
    setConvictions((prev) =>
      prev.length >= beatCount ? prev : [...prev, conviction],
    )
    // conviction carries over as the running belief into the next beat.
  }

  function chooseVerdict(chosen: Verdict) {
    const analysis = analyzePlay(activeTrial, convictions, chosen)
    setVerdict(chosen)
    savePlay({
      day,
      caseId: activeTrial.id,
      convictions,
      verdict: chosen,
      correct: analysis.correct,
      swayedByTraps: analysis.swayedByTraps,
      totalTraps: analysis.totalTraps,
    })
    setRevealStats(statsFromStorage())
    setPhase('reveal')
  }

  return (
    <Shell>
      {phase === 'intro' && (
        <IntroCard trial={trial} dayNumber={dayNumber} onBegin={begin} />
      )}
      {phase === 'beats' && (
        <BeatView
          trial={trial}
          beatIndex={currentBeat}
          value={conviction}
          onChange={setConviction}
          onSubmit={submitBeat}
        />
      )}
      {phase === 'verdict' && (
        <VerdictView
          trial={trial}
          conviction={conviction}
          onChoose={chooseVerdict}
        />
      )}
      {phase === 'reveal' && verdict && revealAnalysis && revealStats && (
        <RevealView
          trial={trial}
          analysis={revealAnalysis}
          verdict={verdict}
          dayNumber={dayNumber}
          stats={revealStats}
        />
      )}
    </Shell>
  )
}
