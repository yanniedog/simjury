import { useEffect, useRef, useState } from 'react'
import type {
  LocalProfile,
  LocalProfileInput,
  LocalProfileIssue,
  LocalProfilePersistence,
} from '../state/localProfile'
import {
  downloadWeeklyProgress,
  type AccessMode,
  type StoredWeeklyProgress,
} from '../state/progress'
import { LocalProfilePanel } from './LocalProfilePanel'

export interface CourtWeekEntryProps {
  title: string
  kicker: string
  enterLabel: string
  advisory: string
  mode: AccessMode
  onMode: (mode: AccessMode) => void
  onEnter: (fullscreen: boolean) => void
  persistenceNotice: string | null
  ephemeral: boolean
  ephemeralAdvisory?: string
  focusHeading: boolean
  localProfile?: {
    profile: LocalProfile
    persistence: LocalProfilePersistence
    issue: LocalProfileIssue
    onChange: (profile: LocalProfileInput) => void
    onReset: () => void
  }
  canEnter: boolean
  availabilityNote?: string
  busy: boolean
  archivedProgress: StoredWeeklyProgress[]
}

export function CourtWeekEntry({
  title,
  kicker,
  enterLabel,
  advisory,
  mode,
  onMode,
  onEnter,
  persistenceNotice,
  ephemeral,
  ephemeralAdvisory,
  focusHeading,
  localProfile,
  canEnter,
  availabilityNote,
  busy,
  archivedProgress,
}: CourtWeekEntryProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const [includeArchiveNotes, setIncludeArchiveNotes] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const enterButtonRef = useRef<HTMLButtonElement>(null)
  const settingsSummaryRef = useRef<HTMLElement>(null)
  const focusAfterAcknowledgement = useRef(false)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  const fullscreenSupported = typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
  const modeLabels: Record<AccessMode, string> = {
    'audio-first': 'Audio first',
    captions: 'Audio + captions',
    reading: 'Reading',
  }
  const acknowledged = !localProfile || localProfile.profile.adultFictionAcknowledged
  useEffect(() => {
    if (!acknowledged || !focusAfterAcknowledgement.current) return
    focusAfterAcknowledgement.current = false
    if (canEnter) enterButtonRef.current?.focus()
    else settingsSummaryRef.current?.focus()
  }, [acknowledged, canEnter])
  const updateAcknowledgement = (adultFictionAcknowledged: boolean) => {
    if (!localProfile) return
    focusAfterAcknowledgement.current = adultFictionAcknowledged
    localProfile.onChange({
      jurorLabel: localProfile.profile.jurorLabel,
      adultFictionAcknowledged,
    })
  }
  return (
    <main className="cw-entry" tabIndex={-1} aria-busy={busy || undefined}>
      <div className="cw-entry__panel">
        <p className="cw-kicker">{kicker}</p>
        <h1 ref={headingRef} tabIndex={focusHeading ? -1 : undefined}>{title}</h1>
        <p className="cw-entry__advisory">{ephemeral && ephemeralAdvisory ? ephemeralAdvisory : advisory}</p>
        {persistenceNotice ? <p className="cw-error" role="alert">{persistenceNotice}</p> : null}
        {!acknowledged ? (
          <label className="cw-entry__consent">
            <input
              type="checkbox"
              checked={false}
              onChange={(event) => updateAcknowledgement(event.target.checked)}
            />
            <span>
              <strong>I’m 18 or older and understand this case is fictional.</strong>
              <small>It deals directly with a non-graphic death and serious criminal allegations.</small>
            </span>
          </label>
        ) : null}
        {availabilityNote ? <p className="cw-entry__availability" role="status">{availabilityNote}</p> : null}
        {canEnter ? (
          <button
            ref={enterButtonRef}
            className="cw-primary cw-entry__primary"
            type="button"
            disabled={!acknowledged}
            onClick={() => onEnter(fullscreen)}
          >
            {enterLabel}
            {enterLabel.startsWith('Resume ') ? <span className="cw-visually-hidden"> — Take your seat</span> : null}
          </button>
        ) : null}
        <details className="cw-entry__settings">
          <summary ref={settingsSummaryRef}>
            <span>Experience settings</span>
            <small>{modeLabels[mode]}</small>
          </summary>
          <div className="cw-entry__settings-body">
            <p>Audio leads by default. Change this at any time during court.</p>
            <fieldset className="cw-mode-picker">
              <legend>Presentation</legend>
              {([
                ['audio-first', 'Audio first', 'Listen without visible captions.'],
                ['captions', 'Audio and captions', 'Listen with speaker-labelled captions.'],
                ['reading', 'Reading mode', 'Keep the complete dialogue visible.'],
              ] as const).map(([value, label, description]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="court-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => onMode(value)}
                  />
                  <span><strong>{label}</strong><small>{description}</small></span>
                </label>
              ))}
            </fieldset>
            {fullscreenSupported ? (
              <label className="cw-entry__fullscreen">
                <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
                Ask to enter full screen
              </label>
            ) : null}
            {localProfile ? (
              <LocalProfilePanel {...localProfile} showAdultFictionAcknowledgement={false} />
            ) : null}
          </div>
        </details>
        {archivedProgress.length > 0 ? (
          <details className="cw-entry__settings cw-entry__archives">
            <summary><span>Previous trial records</span><small>{archivedProgress.length}</small></summary>
            <div className="cw-entry__settings-body">
              <p>These records remain separate from this revision. Their ballots and evidentiary conclusions are available only in an explicit archive export.</p>
              <label className="cw-entry__archive-notes">
                <input
                  type="checkbox"
                  checked={includeArchiveNotes}
                  onChange={(event) => setIncludeArchiveNotes(event.target.checked)}
                />
                Include private notes in archive exports
              </label>
              <ul className="cw-entry__archive-list">
                {archivedProgress.map((archived) => (
                  <li key={archived.revision}>
                    <span><strong>Case revision {archived.revision}</strong><small>{archived.completedSessionIds.length} sessions completed</small></span>
                    <button type="button" onClick={() => downloadWeeklyProgress(archived, includeArchiveNotes)}>
                      Export revision {archived.revision}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
        <p className="cw-entry__privacy">
          {ephemeral
            ? 'Temporary progress and private notes are discarded when you switch sessions or leave this session.'
            : persistenceNotice
            ? 'Use Export progress from the juror desk before leaving this tab.'
            : 'Private by design. Progress and notes stay on this device.'}
          {' '}<a href="/privacy/">Privacy</a>
        </p>
      </div>
    </main>
  )
}
