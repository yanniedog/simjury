import type { TrialCase } from '../lib/caseSchema'

export function IntroCard({
  trial,
  dayNumber,
  onBegin,
}: {
  trial: TrialCase
  dayNumber: number
  onBegin: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Case #{dayNumber} · {trial.era}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          {trial.title}
        </h1>
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
        You are the twelfth juror. You'll see the evidence one piece at a time.
        After each, set how convinced you are — then deliver your verdict and find
        out what really happened.
      </p>

      <button
        type="button"
        onClick={onBegin}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        Take your seat
      </button>
    </div>
  )
}
