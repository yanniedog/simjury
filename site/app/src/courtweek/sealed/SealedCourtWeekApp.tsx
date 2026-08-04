import { useEffect, useMemo, useState } from 'react'
import type {
  CourtSession,
  CourtWeek,
  DeliberationPack,
  TrialRecord,
} from '../model/schema'
import { attachSessionArt, attachSessionAudio } from '../media/manifest'
import { loadWeeklyProgress, type StoredWeeklyProgress } from '../state/progress'
import { observeCourtTime } from '../state/schedule'
import { WEEKLY_PROGRESS_EVENT } from '../state/useWeeklyProgress'
import { CourtWeekApp } from '../ui'
import { eligibleScheduleEntries, loadEligibleCourtPacks, type SealedPackFetcher } from './loader'
import type { CourtDayPack, CourtWeekBootstrap } from './types'

export interface SealedCourtWeekAppProps {
  bootstrap: CourtWeekBootstrap
  now?: () => number
  releaseBase?: string
  packBase?: string
  fetcher?: SealedPackFetcher
}

function baselineProgress(bootstrap: CourtWeekBootstrap, now: number): StoredWeeklyProgress {
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: bootstrap.id,
    revision: bootstrap.revision,
    highestObservedTime: new Date(now).toISOString(),
    completedSessionIds: [],
    currentSessionId: bootstrap.sessions[0]?.id,
    notes: '',
    reasoningContributions: [],
    majorityDirectionReceived: false,
  }
}

function sealedPlaceholderSession(
  entry: CourtWeekBootstrap['sessions'][number],
): CourtSession {
  const placeholderCue = {
    id: `sealed-${entry.ordinal}-cue`,
    event: 'adjournment' as const,
    speaker: 'Court officer',
    text: 'This session remains sealed.',
    accessibleProposition: 'This court session is not yet available.',
    tone: 'formal' as const,
    evidenceIds: [],
    replayable: false,
  }
  const placeholderScene = {
    id: `sealed-${entry.ordinal}-scene`,
    title: 'Sealed session',
    phase: 'arrival' as const,
    visual: {
      fallbackId: 'courtroom',
      alt: 'An empty fictional courtroom awaiting the next session.',
      focalPoint: { x: 50, y: 50 },
      captionPosition: 'bottom' as const,
    },
    cues: [placeholderCue],
    transitionSeconds: 3,
  }
  return {
    id: entry.id,
    ordinal: entry.ordinal,
    day: entry.day,
    title: `${entry.day} session`,
    unlockAt: entry.unlockAt,
    targetMinutes: 20,
    prerequisiteSessionIds: [...entry.prerequisiteSessionIds, `sealed:${entry.id}`],
    scenes: [placeholderScene, placeholderScene, placeholderScene],
  }
}

function runtimeCourtWeek(
  bootstrap: CourtWeekBootstrap,
  packs: CourtDayPack[],
): CourtWeek {
  const byOrdinal = new Map(packs.map((pack) => [pack.ordinal, pack]))
  const trialBase = packs.find((pack) => pack.trialBase)?.trialBase
  const evidence = packs.flatMap((pack) => pack.evidence)
  const trial = {
    ...(trialBase ?? {
      jurisdiction: 'State of Orinth',
      court: 'Superior Criminal Court of Aster Reach',
      charge: 'Murder by intentional omission',
      accused: 'The accused',
      deceased: 'The deceased',
      plea: 'Not Guilty',
      offences: [],
      agreedFacts: [],
      accusedTestifies: false,
    }),
    evidence,
    witnesses: [],
    objections: [],
  } as TrialRecord
  const deliberation = packs.find((pack) => pack.deliberation)?.deliberation ?? {} as DeliberationPack

  return {
    manifest: {
      schemaVersion: 'court-week-v1',
      id: bootstrap.id,
      revision: bootstrap.revision,
      label: bootstrap.label,
      title: bootstrap.title,
      subtitle: bootstrap.subtitle,
      contentAdvisory: bootstrap.contentAdvisory,
      timezone: bootstrap.timezone,
      releaseTag: bootstrap.releaseTag,
      sessions: bootstrap.sessions.map((entry) =>
        byOrdinal.get(entry.ordinal)
          ? attachSessionArt(
              attachSessionAudio(
                byOrdinal.get(entry.ordinal)!.session,
                byOrdinal.get(entry.ordinal)!.media,
                bootstrap.releaseTag,
              ),
              byOrdinal.get(entry.ordinal)!.media,
              bootstrap.releaseTag,
            )
          : sealedPlaceholderSession(entry),
      ),
    },
    trial,
    deliberation,
  }
}

/**
 * Static encryption is spoiler friction, not server-enforced secrecy. A
 * determined user can recover browser-shipped key material. This boundary's
 * promise is narrower: normal builds, page source, preloads and pre-unlock
 * network activity do not expose future authored sessions.
 */
export function SealedCourtWeekApp({
  bootstrap,
  now = Date.now,
  releaseBase,
  packBase = `${import.meta.env.BASE_URL}court-week/packs/`,
  fetcher,
}: SealedCourtWeekAppProps) {
  const [progress, setProgress] = useState<StoredWeeklyProgress | null>(null)
  const [packs, setPacks] = useState<CourtDayPack[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [, setClockTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    void loadWeeklyProgress(bootstrap.id).then((stored) => {
      if (!active) return
      setProgress(stored?.revision === bootstrap.revision
        ? stored
        : baselineProgress(bootstrap, now()))
    })
    const receiveProgress = (event: Event) => {
      const next = (event as CustomEvent<StoredWeeklyProgress>).detail
      if (next?.courtWeekId === bootstrap.id && next.revision === bootstrap.revision) {
        setProgress(next)
      }
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, receiveProgress)
    return () => {
      active = false
      window.removeEventListener(WEEKLY_PROGRESS_EVENT, receiveProgress)
    }
  }, [bootstrap, now])

  const observedNow = progress
    ? observeCourtTime(Date.parse(progress.highestObservedTime), now())
    : now()
  const eligible = progress ? eligibleScheduleEntries(bootstrap, progress, observedNow) : []
  const loadedOrdinals = new Set(packs.map((pack) => pack.ordinal))
  const missingEligible = eligible.some((entry) => !loadedOrdinals.has(entry.ordinal))
  const eligibleKey = eligible.map((entry) => entry.ordinal).join(',')

  useEffect(() => {
    if (!progress || !missingEligible) return
    let active = true
    setLoadError(null)
    void loadEligibleCourtPacks({
      bootstrap,
      progress,
      observedNow,
      baseUrl: packBase,
      ...(fetcher ? { fetcher } : {}),
    }).then((loaded) => {
      if (!active) return
      setPacks((current) => {
        const merged = new Map([...current, ...loaded].map((pack) => [pack.ordinal, pack]))
        return Array.from(merged.values()).sort((left, right) => left.ordinal - right.ordinal)
      })
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'The session could not be opened.')
    })
    return () => { active = false }
  }, [bootstrap, eligibleKey, fetcher, missingEligible, observedNow, packBase, progress, retry])

  const courtWeek = useMemo(() => runtimeCourtWeek(bootstrap, packs), [bootstrap, packs])

  if (!progress) {
    return <main className="cw-loading" aria-busy="true"><p>Preparing the courtroom…</p></main>
  }
  if (loadError) {
    return (
      <main className="cw-entry">
        <div className="cw-entry__panel">
          <p className="cw-kicker">Session still sealed</p>
          <h1>Reconnect to enter court</h1>
          <p>{loadError}</p>
          <p>Previously opened sessions remain stored on this device. No progress has been lost.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      </main>
    )
  }
  // Keep CourtWeekApp mounted once any pack is open so useWeeklyProgress can
  // flush its debounced IndexedDB save across day-boundary pack fetches.
  if (missingEligible && packs.length === 0) {
    return <main className="cw-loading" aria-busy="true"><p>Opening today’s sealed court session…</p></main>
  }

  return (
    <>
      {missingEligible ? (
        <div className="cw-loading cw-loading--inline" aria-busy="true" role="status">
          Opening today’s sealed court session…
        </div>
      ) : null}
      <CourtWeekApp
        courtWeek={courtWeek}
        now={now}
        releaseBase={releaseBase}
      />
    </>
  )
}
