import { useEffect, useState } from 'react'
import type { DocketBeat, DocketCase } from '../../lib/v2/caseSchema'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { ConvictionSlider } from '../ConvictionSlider'
import { CaseMedia, StoryText } from './CaseMedia'
import { CourtroomStage } from './CourtroomStage'

const KIND_META: Record<DocketBeat['kind'], { code: string; label: string }> = {
  witness: { code: 'WIT', label: 'Witness testimony' },
  exhibit: { code: 'EXH', label: 'Exhibit' },
  direction: { code: 'DIR', label: 'Judge’s direction' },
}

function speakerOf(trial: DocketCase, id: string) {
  return trial.cast.find((m) => m.id === id)
}

export function DocketBeatView({
  trial,
  beatIndex,
  value,
  narration,
  playbackRate,
  onChange,
  onNext,
}: {
  trial: DocketCase
  beatIndex: number
  value: number
  narration: boolean
  playbackRate: NarrationRate
  onChange: (value: number) => void
  onNext: () => void
}) {
  const beat = trial.beats[beatIndex]
  const turns = beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]
  const [activeDialogue, setActiveDialogue] = useState<{ beatId: string; index: number } | null>(null)
  const activeTurn = activeDialogue?.beatId === beat.id ? activeDialogue.index : null
  const activeSpeakerId = activeTurn === null ? beat.speaker : turns[activeTurn]?.speaker ?? beat.speaker
  const stageSpeakerId = beat.turns && activeTurn === null ? null : activeSpeakerId
  const total = trial.beats.length
  const speaker = speakerOf(trial, activeSpeakerId)
  const isCheckin = trial.checkins.includes(beat.id)
  const isLast = beatIndex === total - 1
  const media = trial.media?.beats[beat.id]

  // Structured cross-examinations visibly and audibly alternate speakers.
  useEffect(() => {
    setActiveDialogue(null)
    if (narration && beat.turns) {
      speakAll(beat.turns.map((turn) => ({ text: turn.text, key: turn.speaker })), {
        rate: playbackRate,
        onLine: (_key, index) => setActiveDialogue({ beatId: beat.id, index }),
        done: () => setActiveDialogue(null),
      })
    } else if (narration) {
      speak(beat.text, beat.speaker, undefined, playbackRate)
    }
    return stopSpeech
  }, [beat, narration, playbackRate])

  const modeLabel =
    beat.kind === 'witness'
      ? beat.mode === 'cross'
        ? 'Cross-examination'
        : 'Examination'
      : KIND_META[beat.kind].label
  const subtitle = [speaker?.role_label, modeLabel].filter(Boolean).join(' · ')

  return (
    <div className={`phase-view evidence-view evidence-${beat.kind} space-y-6`}>
      <div className="evidence-counter">
        <span><b>{KIND_META[beat.kind].code}</b>{KIND_META[beat.kind].label}</span>
        <span>
          Evidence {beatIndex + 1} of {total}
        </span>
      </div>

      <CourtroomStage trial={trial} activeSpeakerId={stageSpeakerId} phaseLabel={modeLabel} />

      <div>
        <h1 id="phase-heading" tabIndex={-1} className="text-sm font-semibold text-neutral-200 focus:outline-none">
          {speaker?.name ?? beat.speaker}
          <span className="ml-2 font-normal text-neutral-500">
            {subtitle && `· ${subtitle}`}
          </span>
        </h1>
        {media && <div className="mt-4"><CaseMedia asset={media} /></div>}
        {beat.turns ? (
          <section aria-label="Cross-examination transcript" className="mt-4 grid gap-3">
            {turns.map((turn, index) => {
              const member = speakerOf(trial, turn.speaker)
              const witness = turn.speaker === beat.speaker
              return (
                <article
                  key={`${turn.speaker}-${index}`}
                  aria-current={activeTurn === index ? 'true' : undefined}
                  className={`rounded-lg border p-4 ${witness ? 'ml-6 border-emerald-900/60 bg-emerald-950/20' : 'mr-6 border-red-900/60 bg-red-950/20'} ${activeTurn === index ? 'ring-2 ring-amber-300/70' : ''}`}
                >
                  <p className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-neutral-300">
                    <span>
                      {member?.name ?? turn.speaker}
                      {member?.role_label && (
                        <span className="font-normal text-neutral-500"> · {member.role_label}</span>
                      )}
                    </span>
                    {activeTurn === index && <span className="text-xs uppercase tracking-wider text-amber-200">Speaking now</span>}
                  </p>
                  <StoryText text={turn.text} className="text-lg leading-relaxed text-neutral-100" />
                </article>
              )
            })}
          </section>
        ) : (
          <StoryText text={beat.text} className="mt-4 min-h-[6rem] text-lg leading-relaxed text-neutral-100" />
        )}
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
