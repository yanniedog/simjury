import { useEffect, useMemo, useState } from 'react'
import type { Outcome } from './engine/deliberation'
import { analyzeDocketPlay } from './lib/v2/analyze'
import {
  availableDocketSittings,
  INTRO_CASE_ID,
  INTRO_SITTING_DAY,
  introSitting,
  selectDocketSitting,
  type DocketSitting,
} from './lib/v2/cases'
import { dayIndex } from './lib/daily'
import { caseStorageId } from './lib/v2/caseRevision'
import {
  clearProgress,
  isIntroComplete,
  loadAllPlays,
  loadPlayForSitting,
  loadProgress,
  markIntroComplete,
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
  speak,
  stopSpeech,
  type NarrationRate,
} from './lib/narration'
import { phaseNarratorCue } from './lib/narratorCues'
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
import { NarratorCue } from './components/v2/NarratorCue'

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

function IntroGate({
  onStartIntro,
  onSkip,
  narration,
  playbackRate,
}: {
  onStartIntro: () => void
  onSkip: () => void
  narration: boolean
  playbackRate: NarrationRate
}) {
  const cue =
    'Welcome to SimJury. Before today’s case, a short guided sitting teaches how a trial works here — briefing, openings, evidence, your verdict, then the jury room.'

  useEffect(() => {
    if (narration) speak(cue, 'narrator', undefined, playbackRate)
    return stopSpeech
  }, [cue, narration, playbackRate])

  return (
    <div className="phase-view space-y-6 text-center">
      <div className="phase-heading space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          The Daily Docket
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          Start with a guided intro?
        </h1>
      </div>
      <NarratorCue text={cue} />
      <p className="text-sm leading-relaxed text-neutral-400">
        About five minutes. You can reopen it later from the docket archive.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onStartIntro}
          className="rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
        >
          Take the guided intro
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg border border-neutral-700 px-4 py-3 font-semibold text-neutral-200 transition hover:bg-neutral-800"
        >
          Skip to today’s case
        </button>
      </div>
    </div>
  )
}

function DocketApp({
  sitting,
  sittings,
  selectedDay,
  todayDay,
  onSelect,
  intro,
}: {
  sitting: DocketSitting | null
  sittings: DocketSitting[]
  selectedDay: number
  todayDay: number
  onSelect: (day: number) => void
  intro: DocketSitting | null
}) {
  const [narration, setNarration] = useState(narrationEnabled())
  const [playbackRate, setPlaybackRate] = useState(narrationRate())
  const day = sitting?.day ?? todayDay
  const trial = sitting?.trial ?? null
  const storageCaseId = trial ? caseStorageId(trial) : null
  const progress = useMemo(() => loadProgress(day), [day])
  const isIntro = trial?.id === INTRO_CASE_ID

  const validStored = useMemo(() => {
    if (!trial) return null
    return loadPlayForSitting(day, storageCaseId!)
  }, [day, storageCaseId, trial])

  const validProgress = useMemo(() => {
    if (!progress || !trial || validStored) return null
    if (progress.caseId !== storageCaseId || progress.beatIndex >= trial.beats.length) {
      return null
    }
    return progress
  }, [progress, storageCaseId, trial, validStored])

  const [phase, setPhase] = useState<Phase>(
    validStored
      ? (validStored.room ? 'reveal' : 'juryroom')
      : (validProgress?.phase ?? 'intro'),
  )
  const [beatIndex, setBeatIndex] = useState(validProgress?.beatIndex ?? 0)
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
    () => (trial && verdict ? analyzeDocketPlay(trial, verdict) : null),
    [trial, verdict],
  )

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

  useEffect(() => {
    if (!narration) return stopSpeech
    if (phase === 'juryroom') {
      speak(phaseNarratorCue('juryroom'), 'narrator', undefined, playbackRate)
    } else if (phase === 'reveal') {
      speak(phaseNarratorCue('reveal'), 'narrator', undefined, playbackRate)
    }
    return stopSpeech
  }, [phase, narration, playbackRate])

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
          <h1 className="text-2xl font-semibold">SimJury — The Daily Docket</h1>
          <p className="text-neutral-400">
            No case is queued for today. Check back soon.
          </p>
        </div>
      </DocketShell>
    )
  }

  const activeTrial = trial
  const dayNumber = isIntro ? 0 : day + 1
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
    saveProgress({ day, caseId: caseStorageId(activeTrial), ...update })
  }

  function begin() {
    setBeatIndex(0)
    setPhase('openings')
    persistProgress({
      phase: 'openings',
      beatIndex: 0,
    })
  }

  function rewind() {
    if (verdict !== null) return
    clearProgress(day)
    setBeatIndex(0)
    setRoom(null)
    setRevealStats(null)
    setPhase('intro')
  }

  function startEvidence() {
    setPhase('beats')
    persistProgress({
      phase: 'beats',
      beatIndex: 0,
    })
  }

  function nextBeat() {
    const atVerdict = beatIndex + 1 >= beatCount
    const nextBeatIndex = atVerdict ? beatIndex : beatIndex + 1
    if (atVerdict) setPhase('verdict')
    else setBeatIndex(nextBeatIndex)
    persistProgress({
      phase: atVerdict ? 'verdict' : 'beats',
      beatIndex: nextBeatIndex,
    })
  }

  function lockVerdict(chosen: Verdict) {
    const locked = loadPlayForSitting(day, caseStorageId(activeTrial))
    if (verdict !== null) return
    if (locked) {
      clearProgress(day)
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
    savePlay({
      day,
      caseId: caseStorageId(activeTrial),
      convictions: [],
      verdict: chosen,
    })
    clearProgress(day)
    setPhase('juryroom')
  }

  function roomDone(outcome: Outcome) {
    if (!verdict) return
    const done = analyzeDocketPlay(activeTrial, verdict)
    const roomRecord: NonNullable<StoredPlay['room']> = {
      kind: outcome.kind,
      verdict: outcome.verdict,
      g: outcome.tally.g,
      ng: outcome.tally.ng,
    }
    setRoom(roomRecord)
    savePlay({
      day,
      caseId: caseStorageId(activeTrial),
      convictions: [],
      verdict,
      correct: done.correct,
      room: roomRecord,
    })
    if (isIntro) markIntroComplete()
    setRevealStats(statsFromStorage())
    setPhase('reveal')
  }

  function chooseAnotherSitting() {
    const archive = document.querySelector<HTMLDetailsElement>('.docket-archive')
    if (!archive) return
    archive.open = true
    requestAnimationFrame(() => {
      document.getElementById('docket-sitting')?.focus()
      archive.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <DocketShell
      phase={phase}
      caseTitle={activeTrial.title}
      dayNumber={isIntro ? undefined : dayNumber}
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
          introSitting={intro}
        />
      )}
    >
      {phase !== 'intro' && verdict === null && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 text-sm">
          <span className="text-neutral-400">Restarting clears this sitting’s progress.</span>
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
          narration={narration}
          playbackRate={playbackRate}
          onNext={nextBeat}
        />
      )}
      {phase === 'verdict' && (
        <DocketVerdict
          trial={activeTrial}
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
          onChooseAnother={chooseAnotherSitting}
        />
      )}
    </DocketShell>
  )
}

export default function App() {
  const [today] = useState(() => new Date())
  const todayDay = dayIndex(today)
  const sittings = useMemo(() => availableDocketSittings(today), [today])
  const intro = useMemo(() => introSitting(), [])
  const [selectedDay, setSelectedDay] = useState(todayDay)
  const [offerIntro, setOfferIntro] = useState(
    () => Boolean(intro) && !isIntroComplete(),
  )
  const [narration, setNarration] = useState(narrationEnabled())
  const [playbackRate, setPlaybackRate] = useState(narrationRate())

  const selected =
    selectedDay === INTRO_SITTING_DAY
      ? intro
      : selectDocketSitting(sittings, selectedDay)
  const activeDay = selected?.day ?? selectedDay

  if (offerIntro && intro) {
    return (
      <DocketShell
        phase="intro"
        caseTitle="Guided intro"
        narration={narration}
        playbackRate={playbackRate}
        onToggleNarration={() => {
          const next = !narration
          setNarrationEnabled(next)
          setNarration(next)
        }}
        onRateChange={(rate) => setPlaybackRate(setNarrationRate(rate))}
      >
        <IntroGate
          narration={narration}
          playbackRate={playbackRate}
          onStartIntro={() => {
            setOfferIntro(false)
            setSelectedDay(INTRO_SITTING_DAY)
          }}
          onSkip={() => {
            markIntroComplete()
            setOfferIntro(false)
            setSelectedDay(todayDay)
          }}
        />
      </DocketShell>
    )
  }

  return (
    <DocketApp
      key={activeDay}
      sitting={selected}
      sittings={sittings}
      selectedDay={activeDay}
      todayDay={todayDay}
      onSelect={setSelectedDay}
      intro={intro}
    />
  )
}
