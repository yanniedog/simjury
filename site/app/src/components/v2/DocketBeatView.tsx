import { useEffect } from 'react'
import type { DocketBeat, DocketCase } from '../../lib/v2/caseSchema'
import { speak, stopSpeech } from '../../lib/narration'
import { ConvictionSlider } from '../ConvictionSlider'
import { CaseMedia, StoryText } from './CaseMedia'

const KIND_LABEL: Record<DocketBeat['kind'], string> = {
  witness: '🗣️ Witness',
  exhibit: '📄 Exhibit',
  direction: '⚖️ Judge’s direction',
}

function speakerOf(trial: DocketCase, beat: DocketBeat) {
  return trial.cast.find((m) => m.id === beat.speaker)
}

export function DocketBeatView({
  trial,
  beatIndex,
  value,
  narration,
  onChange,
  onNext,
}: {
  trial: DocketCase
  beatIndex: number
  value: number
  narration: boolean
  onChange: (value: number) => void
  onNext: () => void
}) {
  const beat = trial.beats[beatIndex]
  const total = trial.beats.length
  const speaker = speakerOf(trial, beat)
  const isCheckin = trial.checkins.includes(beat.id)
  const isLast = beatIndex === total - 1
  const media = trial.media?.beats[beat.id]

  // Narrate each beat in its speaker's voice; stop when it unmounts.
  useEffect(() => {
    if (narration) speak(beat.text, beat.speaker)
    return stopSpeech
  }, [beat, narration])

  const modeLabel =
    beat.kind === 'witness'
      ? beat.mode === 'cross'
        ? 'Cross-examination'
        : 'Examination'
      : KIND_LABEL[beat.kind]
  const subtitle = [speaker?.role_label, modeLabel].filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>{KIND_LABEL[beat.kind]}</span>
        <span>
          {beatIndex + 1} / {total}
        </span>
      </div>

      <div>
        <h1 id="phase-heading" tabIndex={-1} className="text-sm font-semibold text-neutral-200 focus:outline-none">
          {speaker?.name ?? beat.speaker}
          <span className="ml-2 font-normal text-neutral-500">
            {subtitle && `· ${subtitle}`}
          </span>
        </h1>
        {media && <div className="mt-4"><CaseMedia asset={media} /></div>}
        <StoryText text={beat.text} className="mt-4 min-h-[6rem] text-lg leading-relaxed text-neutral-100" />
      </div>

      {isCheckin && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
          <p className="mb-4 text-center text-xs uppercase tracking-wider text-neutral-500">
            Check-in: where does this leave you?
          </p>
          <ConvictionSlider value={value} onChange={onChange} />
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        {isLast ? 'Reach a verdict' : 'Next →'}
      </button>
    </div>
  )
}
