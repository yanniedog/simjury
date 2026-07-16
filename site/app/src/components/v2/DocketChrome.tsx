import { type ReactNode, useMemo } from 'react'
import { narrationSupported, type NarrationRate } from '../../lib/narration'
import { loadPlayForSitting, loadProgress } from '../../lib/storage'
import type { DocketSitting } from '../../lib/v2/cases'

export function DocketShell({
  children,
  narration,
  playbackRate,
  onToggleNarration,
  onRateChange,
}: {
  children: ReactNode
  narration: boolean
  playbackRate: NarrationRate
  onToggleNarration: () => void
  onRateChange: (rate: string) => void
}) {
  return (
    <main className="docket-shell min-h-screen px-5 pb-12 text-neutral-100">
      <a href="#phase-heading" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black">
        Skip to the case
      </a>
      <div className="mx-auto w-full max-w-md">
        <div className="sticky top-0 z-20 -mx-2 mb-8 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-neutral-950/85 px-2 py-4 text-xs uppercase tracking-wider text-neutral-400 backdrop-blur">
          <a href="/" className="font-semibold text-neutral-300 hover:text-white">SimJury</a>
          {narrationSupported() && (
            <div className="flex items-center gap-2">
              <label>
                <span className="sr-only">Narration speed</span>
                <select
                  aria-label="Narration speed"
                  value={playbackRate}
                  onChange={(event) => onRateChange(event.target.value)}
                  className="min-h-11 rounded-full border border-white/15 bg-neutral-950 px-2 py-2 text-[0.65rem] text-neutral-200"
                >
                  <option value={0.85}>Relaxed</option>
                  <option value={1}>Standard</option>
                  <option value={1.15}>Brisk</option>
                </select>
              </label>
              <button type="button" aria-pressed={narration} onClick={onToggleNarration} className="min-h-11 rounded-full border border-amber-500/40 px-3 py-2 text-amber-100 hover:bg-amber-500/10">
                Voice {narration ? 'on' : 'off'}
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
    </main>
  )
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function sittingStatus(sitting: DocketSitting): string {
  const play = loadPlayForSitting(
    sitting.day,
    sitting.trial.id,
    sitting.trial.checkins.length,
  )
  if (play) return play.room ? 'judgment recorded' : 'jury room in progress'
  const progress = loadProgress(sitting.day)
  return progress?.caseId === sitting.trial.id ? 'in progress' : 'not started'
}

export function DocketSittingChooser({
  sittings,
  selectedDay,
  todayDay,
  statusVersion,
  onSelect,
}: {
  sittings: DocketSitting[]
  selectedDay: number
  todayDay: number
  statusVersion: string
  onSelect: (day: number) => void
}) {
  const options = useMemo(
    () => [...sittings].reverse().map((sitting) => ({
      day: sitting.day,
      statusVersion,
      label: `${sitting.day === todayDay ? 'Today' : dateFormatter.format(sitting.date)} — ${sitting.trial.title} (${sittingStatus(sitting)})`,
    })),
    [sittings, statusVersion, todayDay],
  )

  return (
    <nav aria-label="Daily Docket sittings" className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <label htmlFor="docket-sitting" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Choose a sitting
      </label>
      <select
        id="docket-sitting"
        value={selectedDay}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="min-h-11 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {options.map((option) => (
          <option key={`${option.day}:${option.statusVersion}`} value={option.day}>
            {option.label}
          </option>
        ))}
      </select>
    </nav>
  )
}
