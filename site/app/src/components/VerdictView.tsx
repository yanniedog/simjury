import type { TrialCase } from '../lib/caseSchema'
import type { Verdict } from '../lib/game'

export function VerdictView({
  trial,
  conviction,
  onChoose,
}: {
  trial: TrialCase
  conviction: number
  onChoose: (verdict: Verdict) => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          The evidence is in
        </p>
        <h2 className="text-xl font-semibold text-neutral-50">Your verdict</h2>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-center">
        <p className="text-sm text-neutral-400">You ended at</p>
        <p className="text-2xl font-semibold text-neutral-100">
          {conviction}% convinced of guilt
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          To convict, you must be sure <em>beyond reasonable doubt</em>. Doubt
          alone is enough to acquit.
        </p>
      </div>

      <p className="text-center text-sm text-neutral-500">
        On the charge of {trial.charge.toLowerCase()}, how do you find?
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChoose('Not Guilty')}
          className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-4 font-semibold text-emerald-300 transition hover:bg-emerald-900/40"
        >
          Not Guilty
        </button>
        <button
          type="button"
          onClick={() => onChoose('Guilty')}
          className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-4 font-semibold text-red-300 transition hover:bg-red-900/40"
        >
          Guilty
        </button>
      </div>
    </div>
  )
}
