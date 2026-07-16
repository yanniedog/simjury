import { convictionBand } from '../lib/game'

const TONE = {
  'lean-innocent': { text: 'text-emerald-400', accent: 'accent-emerald-500' },
  uncertain: { text: 'text-amber-300', accent: 'accent-amber-400' },
  'lean-guilty': { text: 'text-red-400', accent: 'accent-red-500' },
} as const

const CHECKIN_COPY = {
  minimum: 'Not persuaded',
  maximum: 'Beyond reasonable doubt',
  position: {
    'lean-innocent': 'Not persuaded',
    uncertain: 'Still uncertain',
    'lean-guilty': 'Leaning toward proof',
  },
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
      <p className={`conviction-position ${tone.text}`}>{CHECKIN_COPY.position[band]}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="How convinced are you of guilt?"
        aria-valuetext={`${CHECKIN_COPY.position[band]}, ${value}% convinced`}
        className={`conviction-range w-full cursor-pointer ${tone.accent}`}
      />
      <div className="flex justify-between gap-6 text-xs uppercase tracking-wider text-neutral-500">
        <span>{CHECKIN_COPY.minimum}</span>
        <span className="text-right">{CHECKIN_COPY.maximum}</span>
      </div>
      <p className="conviction-value">
        Private check-in · {value}% conviction confidence
      </p>
    </div>
  )
}
