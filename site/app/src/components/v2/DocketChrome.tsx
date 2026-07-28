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

export function DocketShell({
  children,
  sidebar,
  phase,
  caseTitle,
  dayNumber,
  charge,
  narration,
  playbackRate,
  voiceEngine = 'kokoro',
  onToggleNarration,
  onRateChange,
  onVoiceEngineChange,
}: {
  children: ReactNode
  sidebar?: ReactNode
  phase: DocketPhase
  caseTitle: string
  dayNumber?: number
  charge?: string
  narration: boolean
  playbackRate: NarrationRate
  voiceEngine?: NarrationEngineId
  onToggleNarration: () => void
  onRateChange: (rate: NarrationRate) => void
  onVoiceEngineChange?: (engine: NarrationEngineId) => void
}) {
  const currentPhaseIndex = PHASES.findIndex((step) => step.id === phase)
  const phaseLabel = PHASES[currentPhaseIndex]?.label ?? 'Briefing'
  const showVoiceMode = altVoiceModeAvailable() && typeof onVoiceEngineChange === 'function'
  const [canPersist] = useState(canPersistSitting)
  return (
    <main className="docket-shell min-h-screen text-neutral-100">
      <a href="#phase-heading" className="docket-skip">Skip to the case</a>
      <header className="docket-topbar">
        <a href="/" className="docket-brand" aria-label="SimJury home">Sim<span>Jury</span></a>
        <div className="docket-case-title"><span>{dayNumber ? `Docket ${String(dayNumber).padStart(4, '0')}` : 'Daily Docket'}</span><strong>{caseTitle}</strong></div>
        <div className="docket-phase" role="progressbar" aria-valuenow={currentPhaseIndex + 1} aria-valuemin={1} aria-valuemax={PHASES.length} aria-valuetext={`${phaseLabel}, stage ${currentPhaseIndex + 1} of ${PHASES.length}`}><span>{phaseLabel}</span><i aria-hidden="true" style={{ width: `${((currentPhaseIndex + 1) / PHASES.length) * 100}%` }} /></div>
        {narrationSupported() && (
          <div className="narration-controls">
            {showVoiceMode && (
              <select
                aria-label="Narration voice mode"
                value={voiceEngine}
                onChange={(event) => onVoiceEngineChange(normaliseNarrationEngine(event.target.value))}
              >
                <option value="kokoro">{DEFAULT_VOICE_LABEL}</option>
                <option value="scylla">{ALT_VOICE_LABEL}</option>
              </select>
            )}
            <select aria-label="Narration speed" value={playbackRate} onChange={(event) => onRateChange(normaliseNarrationRate(event.target.value))}>
              <option value={0.85}>Relaxed</option><option value={1}>Standard</option><option value={1.15}>Brisk</option>
            </select>
            <button type="button" aria-pressed={narration} aria-label="Toggle narration" onClick={onToggleNarration}><span aria-hidden="true">◉</span> Narration {narration ? 'on' : 'off'}</button>
          </div>
        )}
      </header>
      <div className="docket-workspace">
        <section className="docket-stage" aria-label={`${phaseLabel}: ${caseTitle}`}>{children}</section>
        <aside className="juror-docket" aria-label="Juror docket">
          {charge && <div className="docket-context"><p className="chrome-label">Charge before the court</p><p>{charge}</p></div>}
          {sidebar}
          {!canPersist && <p className="storage-warning" role="status">Storage is unavailable. This sitting will not resume after closing.</p>}
          <p className="local-note"><span aria-hidden="true">◆</span> Saved only in this browser. There is no sync; switching browser or device, or clearing site data, removes access to progress, notes, verdicts and stats. <a href="/privacy/">Privacy details</a></p>
        </aside>
      </div>
    </main>
  )
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

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
  const all = introSitting
    ? [introSitting, ...sittings.filter((s) => s.trial.id !== INTRO_CASE_ID)]
    : sittings
  const options = [...all].reverse().map((librarySitting) => {
    const sitting = librarySitting.trial.id === featuredSitting?.trial.id
      ? featuredSitting
      : librarySitting
    return {
      day: sitting.day,
      id: sitting.trial.id,
      label: sitting.trial.id === INTRO_CASE_ID
        ? `Guided intro — ${sitting.trial.title} (${sittingStatus(sitting)})`
        : `${sitting === featuredSitting ? 'Today' : dateFormatter.format(sitting.date)} — ${sitting.trial.title} (${sittingStatus(sitting)})`,
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
      </details>
    </nav>
  )
}
