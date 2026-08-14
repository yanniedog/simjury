import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CourtSession,
  CourtWeek,
  DeliberationPack,
  TrialRecord,
  Verdict,
} from '../model/schema'
import { attachSessionArt, attachSessionAudio } from '../media/manifest'
import { loadWeeklyProgress, type AccessMode, type StoredWeeklyProgress } from '../state/progress'
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
import {
  DEVELOPER_PREVIEW_NOW,
  DEVELOPER_PREVIEW_PATH,
  developerProgressForDay,
  type PreviewAdmissionState,
  type PreviewOutcome,
} from './developerPreview'

const DEVELOPER_PREVIEW_ENABLED = import.meta.env.VITE_COURT_WEEK_PREVIEW === 'enabled'
if (DEVELOPER_PREVIEW_ENABLED) void import('./developerPreview.css')

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
    void loadWeeklyProgress(bootstrap.id, bootstrap.revision).then((stored) => {
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
  const [selectedOrdinal, setSelectedOrdinal] = useState(1)
  const [sceneId, setSceneId] = useState('')
  const [cueId, setCueId] = useState('')
  const [accessMode, setAccessMode] = useState<AccessMode>('reading')
  const [admissionState, setAdmissionState] = useState<PreviewAdmissionState>('at-cue')
  const [ballot, setBallot] = useState<Verdict | 'auto'>('auto')
  const [outcome, setOutcome] = useState<PreviewOutcome>('none')
  const [retry, setRetry] = useState(0)
  const [entered, setEntered] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(() => (
    typeof matchMedia !== 'function' || !matchMedia('(max-width: 640px)').matches
  ))
  const [load, setLoad] = useState<{ ordinal: number; courtWeek?: CourtWeek; error?: string }>({ ordinal: 1 })
  const packLoad = useRef<{ key: string; promise: Promise<CourtDayPack[]> } | null>(null)

  useEffect(() => {
    let active = true
    const entry = bootstrap.sessions[selectedOrdinal - 1]
    setLoad({ ordinal: selectedOrdinal })
    const loadKey = `${bootstrap.releaseTag}:${entry?.locator}:${retry}`
    const packPromise = packLoad.current?.key === loadKey
      ? packLoad.current.promise
      : hydrateCourtPacks({
          bootstrap, entries: entry ? [entry] : [], baseUrl: packBase,
          ...(fetcher ? { fetcher } : {}), persistOpened: false, readOpened: false,
        })
    packLoad.current = { key: loadKey, promise: packPromise }
    void Promise.all([
      packPromise,
      import('../content').then(({ elevenMinutesCourtWeek }) => elevenMinutesCourtWeek),
    ]).then(([opened, authored]) => {
      if (!active || !opened[0]) return
      const runtime = runtimeCourtWeek(bootstrap, [opened[0]])
      setLoad({
        ordinal: selectedOrdinal,
        courtWeek: {
          ...authored,
          manifest: {
            ...runtime.manifest,
            sessions: authored.manifest.sessions.map((session, index) => (
              index === selectedOrdinal - 1 ? runtime.manifest.sessions[index] : session
            )),
          },
        },
      })
    }).catch(() => {
      if (active) setLoad({ ordinal: selectedOrdinal, error: `Session ${selectedOrdinal} could not be opened.` })
    })
    return () => { active = false }
  }, [bootstrap, fetcher, packBase, retry, selectedOrdinal])

  const baseCourtWeek = load.ordinal === selectedOrdinal ? load.courtWeek : undefined
  const selectedSession = baseCourtWeek?.manifest.sessions[selectedOrdinal - 1]
  const selectedScene = selectedSession?.scenes.find(({ id }) => id === sceneId) ?? selectedSession?.scenes[0]
  const selectedCue = selectedScene?.cues.find(({ id }) => id === cueId) ?? selectedScene?.cues[0]
  const courtWeek = useMemo(() => {
    if (!baseCourtWeek || !selectedCue) return null
    const orderedCues = baseCourtWeek.manifest.sessions.flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
    const currentIndex = orderedCues.findIndex(({ id }) => id === selectedCue.id)
    const admittedIds = new Set(orderedCues.slice(0, currentIndex + 1)
      .filter((cue) => cue.event === 'exhibit-admitted' && (
        admissionState === 'include-provisional' || cue.admissionStatus !== 'provisional'
      )).flatMap(({ evidenceIds }) => evidenceIds))
    return {
      ...baseCourtWeek,
      trial: {
        ...baseCourtWeek.trial,
        evidence: baseCourtWeek.trial.evidence.filter(({ id, status }) => status === 'admitted' && (
          admissionState === 'all-admitted' || admittedIds.has(id)
        )),
      },
    }
  }, [admissionState, baseCourtWeek, selectedCue])
  const previewProgress = useMemo(
    () => courtWeek ? developerProgressForDay(courtWeek, selectedOrdinal, {
      sceneId: selectedScene?.id, cueId: selectedCue?.id, accessMode, ballot, outcome,
    }) : null,
    [accessMode, ballot, courtWeek, outcome, selectedCue?.id, selectedOrdinal, selectedScene?.id],
  )

  const changeDay = (ordinal: number) => {
    setSelectedOrdinal(ordinal); setSceneId(''); setCueId(''); setEntered(false)
  }
  const resetEntry = () => setEntered(false)
  const previewKey = [selectedOrdinal, selectedScene?.id, selectedCue?.id, accessMode, admissionState, ballot, outcome].join(':')
  return (
    <div className="cw-test-harness cw-preview-harness" data-entered={entered ? 'true' : 'false'}>
      <details className="cw-developer-toolbar cw-preview-drawer" open={drawerOpen} onToggle={(event) => setDrawerOpen(event.currentTarget.open)}>
        <summary><strong>COURT WEEK PREVIEW</strong><span>{bootstrap.sessions[selectedOrdinal - 1]?.day}</span></summary>
        <div className="cw-preview-grid">
          <label>Day<select id="cw-preview-day" value={selectedOrdinal} onChange={(event) => changeDay(Number(event.target.value))}>
            {bootstrap.sessions.map(({ day, ordinal }) => <option key={ordinal} value={ordinal}>{day}</option>)}
          </select></label>
          <label>Scene<select value={selectedScene?.id ?? ''} disabled={!selectedScene} onChange={(event) => {
            setSceneId(event.target.value); setCueId(''); resetEntry()
          }}>{selectedSession?.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title}</option>)}</select></label>
          <label>Cue<select value={selectedCue?.id ?? ''} disabled={!selectedCue} onChange={(event) => {
            setCueId(event.target.value); resetEntry()
          }}>{selectedScene?.cues.map((cue) => <option key={cue.id} value={cue.id}>{cue.speaker}: {cue.id}</option>)}</select></label>
          <label>Access<select value={accessMode} onChange={(event) => { setAccessMode(event.target.value as AccessMode); resetEntry() }}>
            <option value="audio-first">Audio first</option><option value="captions">Captions</option><option value="reading">Reading</option>
          </select></label>
          <label>Admission<select value={admissionState} onChange={(event) => { setAdmissionState(event.target.value as PreviewAdmissionState); resetEntry() }}>
            <option value="at-cue">Final at cue</option><option value="include-provisional">Include provisional</option><option value="all-admitted">All admitted</option>
          </select></label>
          <label>Ballot<select value={ballot} onChange={(event) => { setBallot(event.target.value as Verdict | 'auto'); resetEntry() }}>
            <option value="auto">Automatic</option><option value="murder">Murder</option><option value="manslaughter">Manslaughter</option><option value="not-guilty">Not Guilty</option><option value="unable-to-agree">Unable to agree</option>
          </select></label>
          <label>Outcome<select value={outcome} onChange={(event) => { setOutcome(event.target.value as PreviewOutcome); resetEntry() }}>
            <option value="none">Not returned</option><option value="murder:unanimous">Murder · unanimous</option><option value="manslaughter:majority">Manslaughter · majority</option><option value="not-guilty:unanimous">Not Guilty · unanimous</option><option value="unable-to-agree:hung">Unable to agree · hung</option>
          </select></label>
        </div>
        <footer><span role="status">{load.error ? 'Selected pack failed.' : courtWeek ? 'One pack loaded.' : 'Opening one pack.'} Saved progress is untouched.</span><button type="button" onClick={onLeave}>Leave preview</button></footer>
      </details>
      {load.error ? <main className="cw-entry"><div className="cw-entry__panel">
        <p className="cw-kicker">Preview pack unavailable</p><h1>{bootstrap.sessions[selectedOrdinal - 1]?.day} could not open</h1>
        <p role="alert">{load.error} Other days remain available.</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry this pack</button>
      </div></main> : !courtWeek || !previewProgress ? (
        <main className="cw-loading" aria-busy="true"><p role="status">Opening selected preview pack…</p></main>
      ) : <CourtWeekApp
        key={previewKey} courtWeek={courtWeek} now={() => DEVELOPER_PREVIEW_NOW} releaseBase={releaseBase}
        initialProgressOverride={previewProgress} ephemeral ephemeralAdvisory={DEVELOPER_PREVIEW_ADVISORY}
        onEnteredChange={setEntered} testSession={{ selectedOrdinal, sessions: bootstrap.sessions, onSelect: changeDay, onLeave }}
      />}
    </div>
  )
}

function developerPreviewRouteRequested(): boolean {
  return DEVELOPER_PREVIEW_ENABLED
    && typeof window !== 'undefined'
    && window.location.pathname === DEVELOPER_PREVIEW_PATH
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
      window.history.replaceState(window.history.state, '', '/')
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
