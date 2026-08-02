import { useState, type ReactNode } from 'react'
import {
  ALT_VOICE_LABEL,
  DEFAULT_VOICE_LABEL,
  altVoiceModeAvailable,
  narrationSupported,
  normaliseNarrationEngine,
  normaliseNarrationRate,
  type NarrationEngineId,
  type NarrationRate,
} from '../../lib/narration'
import { canPersistSitting, loadPlayForSitting, loadProgress } from '../../lib/storage'
import { caseStorageId } from '../../lib/v2/caseRevision'
import type { DocketSitting } from '../../lib/v2/cases'
import { INTRO_CASE_ID } from '../../lib/v2/cases'

export type DocketPhase = 'intro' | 'openings' | 'beats' | 'closings' | 'juryroom' | 'reveal'

const PHASES: Array<{ id: DocketPhase; label: string; short: string }> = [
  { id: 'intro', label: 'Briefing', short: '01' },
  { id: 'openings', label: 'Openings', short: '02' },
  { id: 'beats', label: 'Evidence', short: '03' },
  { id: 'closings', label: 'Closings', short: '04' },
  { id: 'juryroom', label: 'Jury room', short: '05' },
  { id: 'reveal', label: 'Record', short: '06' },
]

/**
 * Audio settings behind one button.
 *
 * Four always-visible controls — voice mode, speed, narration, room tone —
 * wrapped onto a second row at 390px and gave the sticky header about 178px,
 * 21% of the viewport, held permanently on a screen whose job is reading.
 * A <details> keeps this keyboard-reachable and working before hydration.
 */
function AudioMenu({
  narration,
  ambience,
  playbackRate,
  voiceEngine,
  showVoiceMode,
  showNarration,
  onToggleNarration,
  onToggleAmbience,
  onRateChange,
  onVoiceEngineChange,
}: {
  narration: boolean
  ambience?: boolean
  playbackRate: NarrationRate
  voiceEngine: NarrationEngineId
  showVoiceMode: boolean
  showNarration: boolean
  onToggleNarration: () => void
  onToggleAmbience?: () => void
  onRateChange: (rate: NarrationRate) => void
  onVoiceEngineChange?: (engine: NarrationEngineId) => void
}) {
  const showAmbience = typeof ambience === 'boolean' && Boolean(onToggleAmbience)
  const active = (showNarration && narration) || (showAmbience && ambience)
  return (
    <details className="audio-menu">
      <summary aria-label="Audio settings" title="Audio settings">
        <span aria-hidden="true">{active ? '◉' : '◎'}</span>
        <span className="audio-menu-label">Audio</span>
      </summary>
      <div className="audio-menu-panel">
        {showNarration && (
          <>
            <label className="audio-menu-row">
              <span>Narration</span>
              <button
                type="button"
                aria-pressed={narration}
                aria-label="Toggle narration"
                onClick={onToggleNarration}
              >
                {narration ? 'On' : 'Off'}
              </button>
            </label>
            <label className="audio-menu-row">
              <span>Speed</span>
              <select
                aria-label="Narration speed"
                value={playbackRate}
                onChange={(event) => onRateChange(normaliseNarrationRate(event.target.value))}
              >
                <option value={0.85}>Relaxed</option>
                <option value={1}>Standard</option>
                <option value={1.15}>Brisk</option>
              </select>
            </label>
            {showVoiceMode && onVoiceEngineChange && (
              <label className="audio-menu-row">
                <span>Voice</span>
                <select
                  aria-label="Narration voice mode"
                  value={voiceEngine}
                  onChange={(event) => onVoiceEngineChange(normaliseNarrationEngine(event.target.value))}
                >
                  <option value="kokoro">{DEFAULT_VOICE_LABEL}</option>
                  <option value="scylla">{ALT_VOICE_LABEL}</option>
                </select>
              </label>
            )}
          </>
        )}
        {showAmbience && (
          <label className="audio-menu-row">
            <span>Room tone</span>
            <button
              type="button"
              aria-pressed={ambience}
              aria-label="Toggle courtroom ambience"
              onClick={onToggleAmbience}
            >
              Room tone {ambience ? 'on' : 'off'}
            </button>
          </label>
        )}
      </div>
    </details>
  )
}

/**
 * Destructive sitting controls, behind a menu and a confirm.
 *
 * Rewind used to be a full-width banner above every phase, permanent,
 * unconfirmed, and styled close to a primary control in the top-left position
 * the eye lands on first — while the thing it does is unrecoverable.
 */
function SittingMenu({ caseTitle, onRewind }: { caseTitle: string; onRewind: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <details
      className="sitting-menu"
      onToggle={(event) => {
        if (!event.currentTarget.open) setConfirming(false)
      }}
    >
      <summary aria-label="Sitting options" title="Sitting options">
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="sitting-menu-panel">
        {confirming ? (
          <>
            <p className="sitting-menu-warning">
              Rewinding clears this sitting’s progress and notes. It cannot be undone.
            </p>
            <button
              type="button"
              aria-label={`Rewind ${caseTitle} to the beginning`}
              onClick={onRewind}
              className="sitting-menu-danger"
            >
              Yes, rewind and clear
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="sitting-menu-quiet"
            >
              Keep my progress
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="sitting-menu-item">
            Rewind to beginning
          </button>
        )}
      </div>
    </details>
  )
}

export function DocketShell({
  children,
  sidebar,
  phase,
  caseTitle,
  dayNumber,
  charge,
  narration,
  ambience,
  playbackRate,
  voiceEngine = 'kokoro',
  onToggleNarration,
  onToggleAmbience,
  onRateChange,
  onVoiceEngineChange,
  /** Quieter chrome for pre-sitting gates (no false phase progress or empty sidebar). */
  entryMode = false,
  /** Hide narration controls (e.g. age/fiction gate before any spoken cue). */
  hideNarration = false,
  /** Clears this sitting's progress. Offered behind the overflow menu and a confirm. */
  onRewind,
}: {
  children: ReactNode
  sidebar?: ReactNode
  phase: DocketPhase
  caseTitle: string
  dayNumber?: number
  charge?: string
  narration: boolean
  ambience?: boolean
  playbackRate: NarrationRate
  voiceEngine?: NarrationEngineId
  onToggleNarration: () => void
  onToggleAmbience?: () => void
  onRateChange: (rate: NarrationRate) => void
  onVoiceEngineChange?: (engine: NarrationEngineId) => void
  entryMode?: boolean
  hideNarration?: boolean
  onRewind?: () => void
}) {
  const currentPhaseIndex = PHASES.findIndex((step) => step.id === phase)
  const phaseLabel = PHASES[currentPhaseIndex]?.label ?? 'Briefing'
  const stageNumber = currentPhaseIndex + 1
  const showVoiceMode = altVoiceModeAvailable() && typeof onVoiceEngineChange === 'function'
  const [canPersist] = useState(canPersistSitting)
  const showAside = !entryMode
  const showNarration = !hideNarration && narrationSupported()
  const showAmbience = !entryMode && typeof ambience === 'boolean' && Boolean(onToggleAmbience)
  return (
    <main className={`docket-shell min-h-screen text-neutral-100${entryMode ? ' docket-entry' : ''}`}>
      <a href="#phase-heading" className="docket-skip">Skip to the case</a>
      <header className="docket-topbar">
        <a href="/" className="docket-brand" aria-label="SimJury home">Sim<span>Jury</span></a>
        <div className="docket-case-title"><span>{dayNumber ? `Docket ${String(dayNumber).padStart(4, '0')}` : 'Daily Docket'}</span><strong>{caseTitle}</strong></div>
        {!entryMode && (
          <div
            className="docket-phase"
            role="progressbar"
            aria-valuenow={stageNumber}
            aria-valuemin={1}
            aria-valuemax={PHASES.length}
            aria-valuetext={`${phaseLabel}, stage ${stageNumber} of ${PHASES.length}`}
          >
            <span>
              <em aria-hidden="true">{String(stageNumber).padStart(2, '0')}</em>
              {phaseLabel}
            </span>
            <i aria-hidden="true" style={{ width: `${(stageNumber / PHASES.length) * 100}%` }} />
          </div>
        )}
        {/* One button each. The chrome budget is the top bar and nothing else,
            so secondary controls live in the popover they open rather than on
            the bar itself. */}
        {(showNarration || showAmbience || onRewind) && (
          <div className="chrome-menus">
            {(showNarration || showAmbience) && (
              <AudioMenu
                narration={narration}
                ambience={showAmbience ? ambience : undefined}
                playbackRate={playbackRate}
                voiceEngine={voiceEngine}
                showVoiceMode={showVoiceMode}
                showNarration={showNarration}
                onToggleNarration={onToggleNarration}
                onToggleAmbience={showAmbience ? onToggleAmbience : undefined}
                onRateChange={onRateChange}
                onVoiceEngineChange={onVoiceEngineChange}
              />
            )}
            {onRewind && <SittingMenu caseTitle={caseTitle} onRewind={onRewind} />}
          </div>
        )}
      </header>
      <div className={`docket-workspace${entryMode ? ' docket-workspace-entry' : ''}`}>
        <section className="docket-stage" aria-label={entryMode ? caseTitle : `${phaseLabel}: ${caseTitle}`}>{children}</section>
        {showAside && (
          <aside className="juror-docket" aria-label="Juror docket">
            {charge && <div className="docket-context"><p className="chrome-label">Charge before the court</p><p>{charge}</p></div>}
            {sidebar}
            {!canPersist && <p className="storage-warning" role="status">Storage is unavailable. This sitting will not resume after closing.</p>}
            <p className="local-note"><span aria-hidden="true">◆</span> Saved only in this browser. There is no sync; switching browser or device, or clearing site data, removes access to progress, notes, verdicts and stats. <a href="/privacy/">Privacy details</a></p>
          </aside>
        )}
      </div>
    </main>
  )
}

/**
 * Sitting dates are UTC calendar dates, so they are formatted in UTC.
 *
 * `utcDateFromIso` builds a publish date as UTC midnight. Rendering that in the
 * viewer's own zone shows the previous day to everyone west of UTC: a case
 * published 2026-08-05 appeared in the library as "Tue, 4 Aug" in Los Angeles.
 * A publish date is a calendar date, not an instant, so the zone is pinned.
 */
export const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function sittingStatus(sitting: DocketSitting): string {
  if (sitting.trial.id === INTRO_CASE_ID) {
    const play = loadPlayForSitting(sitting.day, caseStorageId(sitting.trial))
    if (play) return play.room ? 'intro complete' : 'jury room in progress'
    const progress = loadProgress(sitting.day)
    return progress?.caseId === caseStorageId(sitting.trial) ? 'in progress' : 'guided intro'
  }
  const play = loadPlayForSitting(sitting.day, caseStorageId(sitting.trial))
  if (play) return play.room ? 'judgment recorded' : 'jury room in progress'
  const progress = loadProgress(sitting.day)
  return progress?.caseId === caseStorageId(sitting.trial) ? 'in progress' : 'not started'
}

export function DocketSittingChooser({ sittings, selectedCaseId, featuredSitting, onSelect, introSitting }: {
  sittings: DocketSitting[]
  selectedCaseId: string
  featuredSitting: DocketSitting | null
  onSelect: (day: number) => void
  /** Synthetic sitting for the guided intro; day may be negative. */
  introSitting?: DocketSitting | null
}) {
  const options = sittings
    .filter((sitting) => sitting.trial.id !== INTRO_CASE_ID)
    .sort((left, right) => left.trial.publish_date.localeCompare(right.trial.publish_date)
      || left.trial.id.localeCompare(right.trial.id))
    .slice(-7)
    .reverse()
    .map((librarySitting) => {
      const sitting = librarySitting.trial.id === featuredSitting?.trial.id
        ? featuredSitting
        : librarySitting
      return {
        day: sitting.day,
        id: sitting.trial.id,
        label: `${sitting === featuredSitting ? 'Today' : dateFormatter.format(sitting.date)} — ${sitting.trial.title} (${sittingStatus(sitting)})`,
      }
    })
  return (
    <nav aria-label="Daily Docket sittings">
      <details className="docket-archive">
        <summary>Case library <span aria-hidden="true">＋</span></summary>
        <label htmlFor="docket-sitting">Choose one of {options.length} cases</label>
        <select
          id="docket-sitting"
          value={selectedCaseId}
          onChange={(event) => {
            const option = options.find(({ id }) => id === event.target.value)
            if (option) onSelect(option.day)
          }}
        >
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        {introSitting && (
          <button
            type="button"
            className="docket-intro-link"
            onClick={() => onSelect(introSitting.day)}
          >
            Guided intro — {introSitting.trial.title} ({sittingStatus(introSitting)})
          </button>
        )}
      </details>
    </nav>
  )
}
