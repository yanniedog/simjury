import type { ReactNode } from 'react'
import {
  narrationSupported,
  normaliseNarrationRate,
  type NarrationRate,
} from '../../lib/narration'
import { loadPlayForSitting, loadProgress } from '../../lib/storage'
import { caseStorageId } from '../../lib/v2/caseRevision'
import type { DocketSitting } from '../../lib/v2/cases'

export type DocketPhase = 'intro' | 'openings' | 'beats' | 'verdict' | 'juryroom' | 'reveal'

const PHASES: Array<{ id: DocketPhase; label: string; short: string }> = [
  { id: 'intro', label: 'Briefing', short: '01' },
  { id: 'openings', label: 'Openings', short: '02' },
  { id: 'beats', label: 'Evidence', short: '03' },
  { id: 'verdict', label: 'Verdict', short: '04' },
  { id: 'juryroom', label: 'Jury room', short: '05' },
  { id: 'reveal', label: 'Record', short: '06' },
]

function PhaseRail({ phase }: { phase: DocketPhase }) {
  const currentIndex = PHASES.findIndex((step) => step.id === phase)
  return (
    <nav className="phase-rail" aria-label="Sitting progress">
      <p className="chrome-label">Sitting progress</p>
      <ol>
        {PHASES.map((step, index) => (
          <li key={step.id} className={index < currentIndex ? 'complete' : undefined} aria-current={step.id === phase ? 'step' : undefined}>
            <span>{step.short}</span><strong>{step.label}</strong>
          </li>
        ))}
      </ol>
    </nav>
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
  playbackRate,
  onToggleNarration,
  onRateChange,
}: {
  children: ReactNode
  sidebar?: ReactNode
  phase: DocketPhase
  caseTitle: string
  dayNumber?: number
  charge?: string
  narration: boolean
  playbackRate: NarrationRate
  onToggleNarration: () => void
  onRateChange: (rate: NarrationRate) => void
}) {
  const currentPhaseIndex = PHASES.findIndex((step) => step.id === phase)
  const phaseLabel = PHASES[currentPhaseIndex]?.label ?? 'Briefing'
  return (
    <main className="docket-shell min-h-screen text-neutral-100">
      <a href="#phase-heading" className="docket-skip">Skip to the case</a>
      <header className="docket-topbar">
        <a href="/" className="docket-brand" aria-label="SimJury home">Sim<span>Jury</span></a>
        <div className="docket-case-title"><span>{dayNumber ? `Docket ${String(dayNumber).padStart(4, '0')}` : 'Daily Docket'}</span><strong>{caseTitle}</strong></div>
        <div className="docket-phase" role="progressbar" aria-valuenow={currentPhaseIndex + 1} aria-valuemin={1} aria-valuemax={PHASES.length} aria-valuetext={`${phaseLabel}, stage ${currentPhaseIndex + 1} of ${PHASES.length}`}><span>{phaseLabel}</span><i aria-hidden="true" style={{ width: `${((currentPhaseIndex + 1) / PHASES.length) * 100}%` }} /></div>
        {narrationSupported() && (
          <div className="narration-controls">
            <select aria-label="Narration speed" value={playbackRate} onChange={(event) => onRateChange(normaliseNarrationRate(event.target.value))}>
              <option value={0.85}>Relaxed</option><option value={1}>Standard</option><option value={1.15}>Brisk</option>
            </select>
            <button type="button" aria-pressed={narration} aria-label="Toggle narration" onClick={onToggleNarration}><span aria-hidden="true">◉</span> Narration {narration ? 'on' : 'off'}</button>
          </div>
        )}
      </header>
      <div className="docket-workspace">
        <aside className="docket-progress"><PhaseRail phase={phase} /></aside>
        <section className="docket-stage" aria-label={`${phaseLabel}: ${caseTitle}`}>{children}</section>
        <aside className="juror-docket" aria-label="Juror docket">
          <div className="juror-identity"><span>JUROR</span><strong>01</strong><p>Your private seat</p></div>
          {charge && <div className="docket-context"><p className="chrome-label">Charge before the court</p><p>{charge}</p></div>}
          <div className="docket-context"><p className="chrome-label">Legal threshold</p><p>Beyond reasonable doubt</p></div>
          {sidebar}
          <p className="local-note"><span aria-hidden="true">◆</span> Your progress and verdict stay on this device. With narration on, spoken lines may fetch public audio clips over the network; case text is not placed in the request.</p>
        </aside>
      </div>
    </main>
  )
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

function sittingStatus(sitting: DocketSitting): string {
  const play = loadPlayForSitting(
    sitting.day,
    caseStorageId(sitting.trial),
  )
  if (play) return play.room ? 'judgment recorded' : 'jury room in progress'
  const progress = loadProgress(sitting.day)
  return progress?.caseId === caseStorageId(sitting.trial) ? 'in progress' : 'not started'
}

export function DocketSittingChooser({ sittings, selectedDay, todayDay, onSelect }: {
  sittings: DocketSitting[]
  selectedDay: number
  todayDay: number
  onSelect: (day: number) => void
}) {
  const options = [...sittings].reverse().map((sitting) => ({
    day: sitting.day,
    label: `${sitting.day === todayDay ? 'Today' : dateFormatter.format(sitting.date)} — ${sitting.trial.title} (${sittingStatus(sitting)})`,
  }))
  return (
    <nav aria-label="Daily Docket sittings">
      <details className="docket-archive">
        <summary>Docket archive <span aria-hidden="true">＋</span></summary>
        <label htmlFor="docket-sitting">Choose another sitting</label>
        <select id="docket-sitting" value={selectedDay} onChange={(event) => onSelect(Number(event.target.value))}>
          {options.map((option) => <option key={option.day} value={option.day}>{option.label}</option>)}
        </select>
      </details>
    </nav>
  )
}
