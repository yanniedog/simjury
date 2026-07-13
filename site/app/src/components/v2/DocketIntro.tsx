import type { DocketCase } from '../../lib/v2/caseSchema'
import {
  narrationEnabled,
  narrationSupported,
  setNarrationEnabled,
} from '../../lib/narration'
import { useState } from 'react'

export function DocketIntro({
  trial,
  dayNumber,
  onBegin,
}: {
  trial: DocketCase
  dayNumber: number
  onBegin: () => void
}) {
  const [narration, setNarration] = useState(narrationEnabled())

  function toggleNarration() {
    setNarrationEnabled(!narration)
    setNarration(!narration)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          The Daily Docket · Case #{dayNumber}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          {trial.title}
        </h1>
        <p className="text-sm text-neutral-400">{trial.setting}</p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          The charge
        </p>
        <p className="mt-1 text-neutral-200">{trial.charge}</p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          To convict, the prosecution must prove
        </p>
        <ul className="mt-2 space-y-2">
          {trial.elements.map((element, i) => (
            <li key={i} className="flex gap-3 text-sm text-neutral-300">
              <span className="text-neutral-600">{i + 1}.</span>
              <span>{element}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm leading-relaxed text-neutral-400">
        You are Juror #1. Hear the evidence, lock your verdict — it's permanent —
        then argue your corner in the jury room and see where the other eleven
        land. About ten minutes, start to verdict.
      </p>

      {narrationSupported() && (
        <button
          type="button"
          onClick={toggleNarration}
          className="w-full rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900"
        >
          {narration ? '🔊 Narration on — headphones recommended' : '🔇 Narration off'}
        </button>
      )}

      <button
        type="button"
        onClick={onBegin}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        Take your seat
      </button>

      <p className="text-center text-xs text-neutral-600">
        Today's case is fiction, built from patterns real trials share. No real
        people, no real companies.
      </p>
    </div>
  )
}
