import { useEffect, useMemo, useState } from 'react'
import type { Outcome } from './engine/deliberation'
import { analyzeDocketPlay } from './lib/v2/analyze'
import {
  availableDocketSittings,
  selectDocketSitting,
  type DocketSitting,
} from './lib/v2/cases'
import { dayIndex } from './lib/daily'
import { START_CONVICTION } from './lib/game'
import {
  clearProgress,
  loadAllPlays,
  loadPlayForSitting,
  loadProgress,
  savePlay,
  saveProgress,
  type StoredProgress,
  type StoredPlay,
} from './lib/storage'
import { computeStats, type DayResult, type Stats } from './lib/stats'
import {
  narrationEnabled,
  narrationRate,
  setNarrationEnabled,
  setNarrationRate,
  type NarrationRate,
} from './lib/narration'
import { DocketIntro } from './components/v2/DocketIntro'
import { OpeningStatements } from './components/v2/OpeningStatements'
import { DocketBeatView } from './components/v2/DocketBeatView'
import { DocketVerdict, type Verdict } from './components/v2/DocketVerdict'
import { JuryRoomView } from './components/v2/JuryRoomView'
import { DocketReveal } from './components/v2/DocketReveal'
import {
  DocketShell,
  DocketSittingChooser,
} from './components/v2/DocketChrome'

type Phase = 'intro' | 'openings' | 'beats' | 'verdict' | 'juryroom' | 'reveal'

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

function DocketApp({
  sitting,
  sittings,
  selectedDay,
  todayDay,
  onSelect,
}: {
  sitting: DocketSitting | null
  sittings: DocketSitting[]
  selectedDay: number
  todayDay: number
  onSelect: (day: number) => void
}) {
  const [narration, setNarration] = useState(narrationEnabled())
  const [playbackRate, setPlaybackRate] = useState(narrationRate())
  const day = sitting?.day ?? todayDay
  const trial = sitting?.trial ?? null
  const progress = useMemo(() => loadProgress(day), [day])

  // Only restore a stored play that belongs to the case now assigned to this
  // day (a queue edit can shift which case falls on a day index) and whose
  // check-in trace matches it; anything else starts fresh. A play with a room
  // result is complete (restore at reveal); one without is a verdict locked
  // before the jury room finished (restore at the room — the lock is
  // permanent, so a refresh must not allow a fresh verdict).
  const validStored = useMemo(() => {
    if (!trial) return null
    return loadPlayForSitting(day, trial.id, trial.checkins.length)
  }, [day, trial])

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
      if (dayIndex(new Date()) !== todayDay) {
        window.location.reload()
      }
    }
    const id = window.setInterval(checkForRollover, 60_000)
    document.addEventListener('visibilitychange', checkForRollover)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', checkForRollover)
    }
  }, [todayDay])

  useEffect(() => {
    document.getElementById('phase-heading')?.focus()
  }, [phase, beatIndex])

  if (!trial) {
    return (
      <DocketShell
        phase="intro"
        caseTitle="The Daily Docket"
        narration={narration}
        playbackRate={playbackRate}
        onToggleNarration={toggleNarration}
        onRateChange={changeNarrationRate}
      >
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">⚖️ SimJury — The Daily Docket</h1>
          <p className="text-neutral-400">
            No case is queued for today. Check back soon.
          </p>
        </div>
      </DocketShell>
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

  function changeNarrationRate(rate: NarrationRate) {
    setPlaybackRate(setNarrationRate(rate))
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

  function rewind() {
    if (verdict !== null) return
    clearProgress(day)
    setBeatIndex(0)
    setCheckinValues([])
    setConviction(START_CONVICTION)
    setRoom(null)
    setRevealStats(null)
    setPhase('intro')
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
    const locked = loadPlayForSitting(
      day,
      activeTrial.id,
      activeTrial.checkins.length,
    )
    if (verdict !== null) return
    if (locked) {
      // Another tab won the race to lock this sitting. Adopt its permanent
      // record instead of leaving this tab stranded on the verdict screen.
      clearProgress(day)
      setCheckinValues(locked.convictions)
      setVerdict(locked.verdict)
      setRoom(locked.room ?? null)
      if (locked.room) {
        setRevealStats(statsFromStorage())
        setPhase('reveal')
      } else {
        setPhase('juryroom')
      }
      return
    }
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
    <DocketShell
      phase={phase}
      caseTitle={activeTrial.title}
      dayNumber={dayNumber}
      charge={activeTrial.charge}
      narration={narration}
      playbackRate={playbackRate}
      onToggleNarration={toggleNarration}
      onRateChange={changeNarrationRate}
      sidebar={(
        <DocketSittingChooser
          sittings={sittings}
          selectedDay={selectedDay}
          todayDay={todayDay}
          onSelect={onSelect}
        />
      )}
    >
      {phase !== 'intro' && verdict === null && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
          <span className="text-neutral-400">Restarting clears this sitting's check-ins.</span>
          <button
            type="button"
            aria-label={`Rewind ${activeTrial.title} to the beginning`}
            onClick={rewind}
            className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 font-medium text-neutral-200 hover:bg-neutral-800"
          >
            Rewind to beginning
          </button>
        </div>
      )}
      {phase === 'intro' && (
        <DocketIntro
          trial={activeTrial}
          dayNumber={dayNumber}
          narration={narration}
          playbackRate={playbackRate}
          onBegin={begin}
        />
      )}
      {phase === 'openings' && (
        <OpeningStatements
          trial={activeTrial}
          narration={narration}
          playbackRate={playbackRate}
          onDone={startEvidence}
        />
      )}
      {phase === 'beats' && (
        <DocketBeatView
          trial={activeTrial}
          beatIndex={beatIndex}
          value={conviction}
          narration={narration}
          playbackRate={playbackRate}
          onChange={updateConviction}
          onNext={nextBeat}
        />
      )}
      {phase === 'verdict' && (
        <DocketVerdict
          trial={activeTrial}
          conviction={conviction}
          narration={narration}
          playbackRate={playbackRate}
          onLock={lockVerdict}
        />
      )}
      {phase === 'juryroom' && verdict && (
        <JuryRoomView
          key={`${activeTrial.id}-${verdict}`}
          trial={activeTrial}
          playerVerdict={verdict}
          narration={narration}
          playbackRate={playbackRate}
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
    </DocketShell>
  )
}

export default function App() {
  const [today] = useState(() => new Date())
  const todayDay = dayIndex(today)
  const sittings = useMemo(() => availableDocketSittings(today), [today])
  const [selectedDay, setSelectedDay] = useState(todayDay)
  const selected = selectDocketSitting(sittings, selectedDay)
  const activeDay = selected?.day ?? selectedDay

  return (
    <DocketApp
      key={activeDay}
      sitting={selected}
      sittings={sittings}
      selectedDay={activeDay}
      todayDay={todayDay}
      onSelect={setSelectedDay}
    />
  )
}
