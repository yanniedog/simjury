import { convictionBand } from '../lib/game'

const TONE = {
  'lean-innocent': { text: 'text-emerald-400', accent: 'accent-emerald-500' },
  uncertain: { text: 'text-amber-300', accent: 'accent-amber-400' },
  'lean-guilty': { text: 'text-red-400', accent: 'accent-red-500' },
} as const

export function ConvictionSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const tone = TONE[convictionBand(value)]
  return (
    <div className="space-y-3">
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="How convinced are you of guilt?"
        className={`w-full cursor-pointer ${tone.accent}`}
      />
      <div className="flex items-baseline justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>Innocent</span>
        <span>Guilty</span>
      </div>
      <p className={`text-center text-sm font-semibold ${tone.text}`}>
        {value}% convinced of guilt
      </p>
    </div>
  )
}
