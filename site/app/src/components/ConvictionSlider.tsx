import { convictionBand } from '../lib/game'

const TONE = {
  'lean-innocent': { text: 'text-emerald-400', accent: 'accent-emerald-500' },
  uncertain: { text: 'text-amber-300', accent: 'accent-amber-400' },
  'lean-guilty': { text: 'text-red-400', accent: 'accent-red-500' },
} as const

const POSITION = {
  'lean-innocent': 'Not persuaded',
  uncertain: 'Still uncertain',
  'lean-guilty': 'Leaning toward proof',
} as const

export function ConvictionSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const band = convictionBand(value)
  const tone = TONE[band]
  return (
    <div className="conviction-checkin space-y-3">
      <p className={`conviction-position ${tone.text}`}>{POSITION[band]}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="How convinced are you of guilt?"
        aria-valuetext={`${POSITION[band]}, ${value}% convinced`}
        className={`conviction-range w-full cursor-pointer ${tone.accent}`}
      />
      <div className="flex justify-between gap-6 text-xs uppercase tracking-wider text-neutral-500">
        <span>Not persuaded</span>
        <span className="text-right">Beyond reasonable doubt</span>
      </div>
      <p className="conviction-value">
        Private check-in · {value}% conviction confidence
      </p>
    </div>
  )
}
