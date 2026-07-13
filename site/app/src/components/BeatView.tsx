import type { TrialCase } from '../lib/caseSchema'
import { ConvictionSlider } from './ConvictionSlider'

const KIND_LABEL = {
  witness: '🗣️ Witness',
  exhibit: '📄 Exhibit',
  direction: '⚖️ Judge’s direction',
} as const

export function BeatView({
  trial,
  beatIndex,
  value,
  onChange,
  onSubmit,
}: {
  trial: TrialCase
  beatIndex: number
  value: number
  onChange: (value: number) => void
  onSubmit: () => void
}) {
  const beat = trial.beats[beatIndex]
  const total = trial.beats.length
  const isLast = beatIndex === total - 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>{KIND_LABEL[beat.kind]}</span>
        <span>
          Evidence {beatIndex + 1} / {total}
        </span>
      </div>

      <p className="min-h-[6rem] text-lg leading-relaxed text-neutral-100">
        {beat.text}
      </p>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <p className="mb-4 text-center text-xs uppercase tracking-wider text-neutral-500">
          Where does this leave you?
        </p>
        <ConvictionSlider value={value} onChange={onChange} />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        {isLast ? 'Reach a verdict' : 'Next piece of evidence'}
      </button>
    </div>
  )
}
