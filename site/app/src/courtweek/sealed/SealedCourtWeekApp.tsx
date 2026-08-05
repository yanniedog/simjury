import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  developerProgressForDay,
  verifyDeveloperToken,
} from './developerPreview'

export interface SealedCourtWeekAppProps {
  bootstrap: CourtWeekBootstrap
  now?: () => number
  releaseBase?: string
  packBase?: string
  fetcher?: SealedPackFetcher
  developerDigest?: string
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
function StandardSealedCourtWeekApp({
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
    await Promise.all(prepared.packs.map((pack) => saveOpenedPack(pack)))
    setPacks((existing) => {
      const merged = new Map([...existing, ...prepared.packs].map((pack) => [pack.ordinal, pack]))
      return Array.from(merged.values()).sort((left, right) => left.ordinal - right.ordinal)
    })
    return prepared.progress
  }, [bootstrap, courtWeek.manifest.sessions, fetcher, now, packBase])

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
        prepareProgressImport={prepareProgressImport}
      />
    </>
  )
}

function DeveloperAccessGate({
  onAuthorised,
  expectedDigest,
}: { onAuthorised: () => void; expectedDigest?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const token = input.current?.value ?? ''
    setChecking(true)
    setError('')
    try {
      if (!await verifyDeveloperToken(token, expectedDigest)) {
        setError('That developer access key was not recognised.')
        window.setTimeout(() => {
          input.current?.focus()
          input.current?.select()
        }, 0)
        return
      }
      form.reset()
      if (input.current) input.current.value = ''
      history.replaceState(history.state, '', `${location.pathname}${location.search}`)
      onAuthorised()
    } catch {
      setError('Developer access could not be checked in this browser.')
      window.setTimeout(() => {
        input.current?.focus()
        input.current?.select()
      }, 0)
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="cw-entry">
      <form className="cw-entry__panel cw-developer-gate" onSubmit={(event) => void submit(event)}>
        <p className="cw-kicker">Owner access</p>
        <h1>Developer preview</h1>
        <p id="cw-developer-access-help">
          Enter the private developer access key to inspect the complete Court Week without changing saved juror progress.
        </p>
        <label htmlFor="cw-developer-access"><strong>Developer access key</strong></label>
        <input
          ref={input}
          id="cw-developer-access"
          type="password"
          autoComplete="off"
          aria-describedby="cw-developer-access-help"
          disabled={checking}
          required
        />
        {error ? <p className="cw-error" role="alert">{error}</p> : null}
        <button className="cw-primary" type="submit" disabled={checking}>
          {checking ? 'Checking access…' : 'Open developer preview'}
        </button>
      </form>
    </main>
  )
}

const DEVELOPER_PREVIEW_ADVISORY = [
  'Fictional, non-graphic marine-emergency death, including an acted distress call.',
  'Pause or leave at any time; preview progress is discarded when you switch sessions or leave preview.',
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
  }, [entered, selectedOrdinal])

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
  if (!packs) return <main className="cw-loading" aria-busy="true"><p>Opening developer preview…</p></main>

  const courtWeek = runtimeCourtWeek(bootstrap, packs.filter(({ ordinal }) => ordinal <= selectedOrdinal))
  const previewProgress = developerProgressForDay(courtWeek, selectedOrdinal)
  return (
    <div className="cw-developer-preview">
      {!entered ? <aside className="cw-developer-toolbar" aria-label="Developer preview controls">
        <strong>DEV PREVIEW</strong>
        <label htmlFor="cw-developer-day">Session</label>
        <select
          ref={sessionSelector}
          id="cw-developer-day"
          value={selectedOrdinal}
          onChange={(event) => setSelectedOrdinal(Number(event.target.value))}
        >
          {bootstrap.sessions.map(({ day, ordinal }) => <option key={ordinal} value={ordinal}>{day}</option>)}
        </select>
        <span role="status">Saved juror progress is untouched. Preview changes are discarded.</span>
        <button type="button" onClick={onLeave}>Leave preview</button>
      </aside> : null}
      <CourtWeekApp
        key={selectedOrdinal}
        courtWeek={courtWeek}
        now={() => DEVELOPER_PREVIEW_NOW}
        releaseBase={releaseBase}
        initialProgressOverride={previewProgress}
        ephemeral
        ephemeralAdvisory={DEVELOPER_PREVIEW_ADVISORY}
        onEnteredChange={setEntered}
        developerPreview={{
          selectedOrdinal,
          sessions: bootstrap.sessions,
          onSelect: (ordinal) => { setSelectedOrdinal(ordinal); setEntered(false) },
          onLeave,
        }}
      />
    </div>
  )
}

export function SealedCourtWeekApp(props: SealedCourtWeekAppProps) {
  const [developerMode, setDeveloperMode] = useState<'gate' | 'preview' | 'standard'>(() => (
    typeof location !== 'undefined' && location.hash === '#developer' ? 'gate' : 'standard'
  ))
  useEffect(() => {
    const openDeveloperGate = () => {
      if (location.hash === '#developer') {
        setDeveloperMode((current) => current === 'standard' ? 'gate' : current)
      }
    }
    window.addEventListener('hashchange', openDeveloperGate)
    return () => window.removeEventListener('hashchange', openDeveloperGate)
  }, [])
  const packBase = props.packBase ?? `${import.meta.env.BASE_URL}court-week/packs/`
  if (developerMode === 'gate') {
    return <DeveloperAccessGate
      expectedDigest={props.developerDigest}
      onAuthorised={() => setDeveloperMode('preview')}
    />
  }
  if (developerMode === 'preview') {
    return <DeveloperPreview {...props} packBase={packBase} onLeave={() => setDeveloperMode('standard')} />
  }
  return <StandardSealedCourtWeekApp {...props} packBase={packBase} />
}
