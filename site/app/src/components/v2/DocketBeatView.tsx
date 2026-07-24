import { useEffect, useRef, useState } from 'react'
import type { DocketBeat, DocketCase } from '../../lib/v2/caseSchema'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { phaseNarratorCue, speakerNarratorCue } from '../../lib/narratorCues'
import { CaseMedia, StoryText } from './CaseMedia'
import { NarratorCue } from './NarratorCue'

function speakerOf(trial: DocketCase, id: string) {
  return trial.cast.find((m) => m.id === id)
}

function modeLabelFor(beat: DocketBeat): string {
  if (beat.kind === 'witness') {
    return beat.mode === 'cross' ? 'Cross-examination' : 'Examination'
  }
  if (beat.kind === 'exhibit') return 'Exhibit'
  return 'Judge’s direction'
}

function beatModeKey(beat: DocketBeat): string {
  return `${beat.kind}:${beat.mode ?? ''}`
}

export function DocketBeatView({
  trial,
  beatIndex,
  narration,
  playbackRate,
  onNext,
}: {
  trial: DocketCase
  beatIndex: number
  narration: boolean
  playbackRate: NarrationRate
  onNext: () => void
}) {
  const beat = trial.beats[beatIndex]
  const turns = beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]
  const [activeDialogue, setActiveDialogue] = useState<{ beatId: string; index: number } | null>(null)
  const activeTurn = activeDialogue?.beatId === beat.id ? activeDialogue.index : null
  const activeSpeakerId = activeTurn === null ? beat.speaker : turns[activeTurn]?.speaker ?? beat.speaker
  const total = trial.beats.length
  const speaker = speakerOf(trial, activeSpeakerId)
  const isLast = beatIndex === total - 1
  const media = trial.media?.beats[beat.id]
  const previousSpeaker = useRef<string | null>(null)
  const previousModeKey = useRef<string | null>(null)
  const phaseCueShown = useRef(false)
  // Lock the chosen cue per beat id so speakAll onLine setState cannot flip cueText mid-beat.
  const lockedCue = useRef<{ beatId: string; text: string | null } | null>(null)

  if (lockedCue.current?.beatId !== beat.id) {
    const showPhaseCue = beatIndex === 0 && !phaseCueShown.current
    const modeKey = beatModeKey(beat)
    const speakerOrModeChanged =
      previousSpeaker.current !== beat.speaker || previousModeKey.current !== modeKey
    const speakerCue = speakerOrModeChanged ? speakerNarratorCue(trial, beat) : null
    lockedCue.current = {
      beatId: beat.id,
      text: showPhaseCue ? phaseNarratorCue('beats') : speakerCue,
    }
    previousSpeaker.current = beat.speaker
    previousModeKey.current = modeKey
    if (beatIndex === 0) phaseCueShown.current = true
  }
  const cueText = lockedCue.current.text

  useEffect(() => {
    setActiveDialogue(null)
    if (!narration) return stopSpeech

    const lines: Array<{ text: string; key: string }> = []
    if (cueText) lines.push({ text: cueText, key: 'narrator' })
    if (beat.turns) {
      lines.push(...beat.turns.map((turn) => ({ text: turn.text, key: turn.speaker })))
    } else {
      lines.push({ text: beat.text, key: beat.speaker })
    }

    if (lines.length === 1) {
      speak(lines[0].text, lines[0].key, undefined, playbackRate)
    } else {
      speakAll(lines, {
        rate: playbackRate,
        onLine: (key, index) => {
          if (key === 'narrator') return
          const dialogueIndex = cueText ? index - 1 : index
          if (dialogueIndex >= 0) setActiveDialogue({ beatId: beat.id, index: dialogueIndex })
        },
        done: () => setActiveDialogue(null),
        onError: () => setActiveDialogue(null),
      })
    }
    return stopSpeech
  }, [beat, cueText, narration, playbackRate])

  const modeLabel = modeLabelFor(beat)
  const subtitle = [speaker?.role_label, modeLabel].filter(Boolean).join(' · ')

  return (
    <div className={`phase-view evidence-view evidence-${beat.kind} space-y-6`}>
      <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
        Evidence {beatIndex + 1} of {total} · {modeLabel}
      </p>

      {cueText && <NarratorCue text={cueText} />}

      <div>
        <h1 id="phase-heading" tabIndex={-1} className="text-sm font-semibold text-neutral-200 focus:outline-none">
          {speaker?.name ?? beat.speaker}
          <span className="ml-2 font-normal text-neutral-500">
            {subtitle && `· ${subtitle}`}
          </span>
        </h1>
        {media && <div className="mt-4"><CaseMedia asset={media} /></div>}
        {beat.turns ? (
          <section aria-label={`${modeLabel} transcript`} className="mt-4 grid gap-3">
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
