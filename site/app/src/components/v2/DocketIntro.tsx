import type { DocketCase } from '../../lib/v2/caseSchema'

export function DocketIntro({
  trial,
  dayNumber,
  onBegin,
}: {
  trial: DocketCase
  dayNumber: number
  onBegin: () => void
}) {
  const accused = trial.cast.find((m) => m.id === trial.accused.cast_id)

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          The Daily Docket · Case #{dayNumber}
        </p>
        <h1 id="phase-heading" tabIndex={-1} className="text-2xl font-semibold tracking-tight text-neutral-50 focus:outline-none">
          {trial.title}
        </h1>
        <p className="text-sm text-neutral-400">{trial.setting}</p>
      </div>

      <p className="border-l-2 border-neutral-600 pl-4 text-lg italic leading-relaxed text-neutral-200">
        {trial.hook}
      </p>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          On trial
        </p>
        <p className="mt-1 font-semibold text-neutral-100">
          {accused?.name ?? trial.accused.cast_id}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-300">
          {trial.accused.human}
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          If you convict: <span className="text-neutral-200">{trial.accused.if_guilty}</span>
        </p>
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
        You are Juror #1. Hear the evidence, commit your verdict for today's
        sitting, then explain what persuaded you. About ten minutes, start to
        verdict.
      </p>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-relaxed text-neutral-400">
        <strong className="text-neutral-200">A private simulation, not live people.</strong>{' '}
        The other eleven jurors are fictional and follow seeded case rules—not
        live chat or AI. Your progress stays in this browser.
      </div>

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
