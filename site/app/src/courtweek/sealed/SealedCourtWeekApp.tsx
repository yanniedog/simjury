import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  loadLocalProfile,
  resetLocalProfile,
  saveLocalProfile,
  type LocalProfileInput,
  type LocalProfileResult,
} from '../state/localProfile'
import { CourtWeekApp } from '../ui'
import {
  eligibleScheduleEntries,
  hydrateCourtPacks,
  loadEligibleCourtPacks,
  type SealedPackFetcher,
} from './loader'
import { saveOpenedPack } from './packStore'
import { prepareSealedProgressImport } from './progressImport'
import type { CourtDayPack, CourtWeekBootstrap } from './types'
import { DEVELOPER_PREVIEW_NOW, developerProgressForDay } from './developerPreview'

const DEVELOPER_PREVIEW_ENABLED = import.meta.env.DEV || import.meta.env.MODE === 'test'

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

function equivalentSnapshotValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => equivalentSnapshotValue(value, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const definedKeys = (record: Record<string, unknown>) => Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
  const leftKeys = definedKeys(leftRecord)
  const rightKeys = definedKeys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => (
    key === rightKeys[index] && equivalentSnapshotValue(leftRecord[key], rightRecord[key])
  ))
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
function StandardSealedCourtWeekApp({
  bootstrap,
  now = Date.now,
  releaseBase,
  packBase = `${import.meta.env.BASE_URL}court-week/packs/`,
  fetcher,
  focusEntryHeading = false,
  localProfile,
}: SealedCourtWeekAppProps & {
  focusEntryHeading?: boolean
  localProfile?: {
    state: LocalProfileResult
    onChange: (profile: LocalProfileInput) => void
    onReset: () => void
  }
}) {
  const [progress, setProgress] = useState<StoredWeeklyProgress | null>(null)
  const [packs, setPacks] = useState<CourtDayPack[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [, setClockTick] = useState(0)
  const errorHeading = useRef<HTMLHeadingElement>(null)
  const inFlightLoad = useRef<{
    bootstrap: CourtWeekBootstrap
    eligibleKey: string
    fetcher: SealedPackFetcher | undefined
    packBase: string
    retry: number
    promise: Promise<CourtDayPack[]>
  } | null>(null)

  useEffect(() => {
    if (focusEntryHeading && loadError) errorHeading.current?.focus()
  }, [focusEntryHeading, loadError])

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
        setProgress((current) => current && equivalentSnapshotValue(current, next) ? current : next)
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
    if (!progress || !missingEligible) {
      if (!missingEligible) inFlightLoad.current = null
      return
    }
    let active = true
    setLoadError(null)
    const existingLoad = inFlightLoad.current
    const matchesExisting = existingLoad?.bootstrap === bootstrap &&
      existingLoad.eligibleKey === eligibleKey &&
      existingLoad.fetcher === fetcher &&
      existingLoad.packBase === packBase &&
      existingLoad.retry === retry
    const load = matchesExisting
      ? existingLoad.promise
      : loadEligibleCourtPacks({
          bootstrap,
          progress,
          observedNow,
          baseUrl: packBase,
          ...(fetcher ? { fetcher } : {}),
        })
    if (!matchesExisting) {
      inFlightLoad.current = { bootstrap, eligibleKey, fetcher, packBase, retry, promise: load }
    }
    void load.then((loaded) => {
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
  const prepareProgressImport = useCallback(async (
    text: string,
    current: StoredWeeklyProgress,
  ) => {
    const prepared = await prepareSealedProgressImport({
      text,
      bootstrap,
      currentProgress: current,
      // Imported watermarks are untrusted. Only this browser's live clock may
      // authorise a previously unopened session during device transfer.
      observedNow: now(),
      baseUrl: packBase,
      sealedSessions: courtWeek.manifest.sessions,
      ...(fetcher ? { fetcher } : {}),
    })
    await Promise.all(prepared.packs.map((pack) => saveOpenedPack(pack, bootstrap.releaseTag)))
    setPacks((existing) => {
      const merged = new Map([...existing, ...prepared.packs].map((pack) => [pack.ordinal, pack]))
      return Array.from(merged.values()).sort((left, right) => left.ordinal - right.ordinal)
    })
    return prepared.progress
  }, [bootstrap, courtWeek.manifest.sessions, fetcher, now, packBase])

  if (!progress) {
    return <main className="cw-loading" aria-busy="true"><p role="status">Preparing your place in court…</p></main>
  }
  if (loadError) {
    return (
      <main className="cw-entry">
        <div className="cw-entry__panel">
          <p className="cw-kicker">Session still sealed</p>
          <h1 ref={errorHeading} tabIndex={focusEntryHeading ? -1 : undefined}>
            Reconnect to enter court
          </h1>
          <p>{loadError}</p>
          <p>Previously opened sessions remain stored on this device. No progress has been lost.</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        </div>
      </main>
    )
  }
  return (
    <>
      {missingEligible && packs.length > 0 ? (
        <div className="cw-loading cw-loading--inline" aria-busy="true" role="status">
          Opening today’s sealed court session…
        </div>
      ) : null}
      <CourtWeekApp
        courtWeek={courtWeek}
        now={now}
        releaseBase={releaseBase}
        prepareProgressImport={prepareProgressImport}
        focusEntryHeading={focusEntryHeading}
        entryBusy={missingEligible && packs.length === 0}
        localProfile={localProfile ? {
          profile: localProfile.state.profile,
          persistence: localProfile.state.persistence,
          issue: localProfile.state.issue,
          onChange: localProfile.onChange,
          onReset: localProfile.onReset,
        } : undefined}
      />
    </>
  )
}

const DEVELOPER_PREVIEW_ADVISORY = /* @__PURE__ */ [
  'Fictional, non-graphic marine-emergency death, including an acted distress call.',
  'Pause or leave at any time; temporary progress is discarded when you switch or leave this session.',
  'Suitable for adults.',
].join(' ')

function DeveloperPreview({
  bootstrap,
  releaseBase,
  packBase,
  fetcher,
  onLeave,
}: Required<Pick<SealedCourtWeekAppProps, 'bootstrap' | 'packBase'>> &
  Pick<SealedCourtWeekAppProps, 'releaseBase' | 'fetcher'> & { onLeave: () => void }) {
  const [packs, setPacks] = useState<CourtDayPack[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selectedOrdinal, setSelectedOrdinal] = useState(1)
  const [retry, setRetry] = useState(0)
  const [entered, setEntered] = useState(false)
  const sessionSelector = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!entered) sessionSelector.current?.focus()
  }, [entered, packs, selectedOrdinal])

  useEffect(() => {
    let active = true
    setLoadError('')
    void hydrateCourtPacks({
      bootstrap,
      entries: bootstrap.sessions,
      baseUrl: packBase,
      ...(fetcher ? { fetcher } : {}),
      persistOpened: false,
      readOpened: false,
    }).then((opened) => {
      if (active) setPacks(opened)
    }).catch(() => {
      if (active) setLoadError('The developer sessions could not be opened.')
    })
    return () => { active = false }
  }, [bootstrap, fetcher, packBase, retry])

  const courtWeek = useMemo(
    () => packs
      ? runtimeCourtWeek(bootstrap, packs.filter(({ ordinal }) => ordinal <= selectedOrdinal))
      : null,
    [bootstrap, packs, selectedOrdinal],
  )
  const previewProgress = useMemo(
    () => courtWeek ? developerProgressForDay(courtWeek, selectedOrdinal) : null,
    [courtWeek, selectedOrdinal],
  )

  if (loadError) {
    return <main className="cw-entry"><div className="cw-entry__panel">
      <p className="cw-kicker">Developer preview</p><h1>Sessions unavailable</h1>
      <p role="alert">{loadError}</p>
      <div className="cw-button-row">
        <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
        <button type="button" onClick={onLeave}>Leave preview</button>
      </div>
    </div></main>
  }
  if (!courtWeek || !previewProgress) {
    return (
      <main className="cw-loading" aria-busy="true">
        <p role="status">Opening developer preview…</p>
        <div className="cw-button-row">
          <button type="button" onClick={onLeave}>Leave preview</button>
        </div>
      </main>
    )
  }
  return (
    <div className="cw-test-harness" data-entered={entered ? 'true' : 'false'}>
      <aside className="cw-developer-toolbar" aria-label="Developer preview controls">
        <strong>DEV PREVIEW</strong>
        <label htmlFor="cw-developer-day">Session</label>
        <select
          ref={sessionSelector}
          id="cw-developer-day"
          value={selectedOrdinal}
          onChange={(event) => {
            setSelectedOrdinal(Number(event.target.value))
            setEntered(false)
          }}
        >
          {bootstrap.sessions.map(({ day, ordinal }) => <option key={ordinal} value={ordinal}>{day}</option>)}
        </select>
        <span role="status">Saved juror progress is untouched. Preview changes are discarded.</span>
        <button type="button" onClick={onLeave}>Leave preview</button>
      </aside>
      <CourtWeekApp
        key={selectedOrdinal}
        courtWeek={courtWeek}
        now={() => DEVELOPER_PREVIEW_NOW}
        releaseBase={releaseBase}
        initialProgressOverride={previewProgress}
        ephemeral
        ephemeralAdvisory={DEVELOPER_PREVIEW_ADVISORY}
        onEnteredChange={setEntered}
        testSession={{
          selectedOrdinal,
          sessions: bootstrap.sessions,
          onSelect: (ordinal) => { setSelectedOrdinal(ordinal); setEntered(false) },
          onLeave,
        }}
      />
    </div>
  )
}

function developerPreviewRouteRequested(): boolean {
  return DEVELOPER_PREVIEW_ENABLED
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('developer-preview') === 'all'
}

export function SealedCourtWeekApp(props: SealedCourtWeekAppProps) {
  const [localProfile, setLocalProfile] = useState<LocalProfileResult>(loadLocalProfile)
  const [previewRoute, setPreviewRoute] = useState(developerPreviewRouteRequested)
  const [focusPublicEntry, setFocusPublicEntry] = useState(false)
  const changeLocalProfile = useCallback((profile: LocalProfileInput) => {
    setLocalProfile(saveLocalProfile(profile))
  }, [])
  const clearLocalProfile = useCallback(() => {
    setLocalProfile(resetLocalProfile())
  }, [])
  const packBase = props.packBase ?? `${import.meta.env.BASE_URL}court-week/packs/`
  if (DEVELOPER_PREVIEW_ENABLED && previewRoute && localProfile.profile.adultFictionAcknowledged) {
    return <DeveloperPreview {...props} packBase={packBase} onLeave={() => {
      const url = new URL(window.location.href)
      url.searchParams.delete('developer-preview')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
      setFocusPublicEntry(true)
      setPreviewRoute(false)
    }} />
  }
  return <StandardSealedCourtWeekApp
    {...props}
    packBase={packBase}
    focusEntryHeading={focusPublicEntry}
    localProfile={{
      state: localProfile,
      onChange: changeLocalProfile,
      onReset: clearLocalProfile,
    }}
  />
}
