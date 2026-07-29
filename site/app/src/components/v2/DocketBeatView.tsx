import { useEffect, useId, useRef, useState } from 'react'
import type { DocketBeat, DocketCase } from '../../lib/v2/caseSchema'
import { NOTE_MAX_LEN, noteForBeat, PLAYER_NOTE_OWNER, type SittingNote } from '../../lib/jurorNotes'
import { speak, speakAll, stopSpeech, type NarrationRate } from '../../lib/narration'
import { phaseNarratorCue, speakerNarratorCue } from '../../lib/narratorCues'
import { CaseMedia, StoryText } from './CaseMedia'
import { EvidenceIndex } from './EvidenceIndex'
import { NarratorCue } from './NarratorCue'
import { SpeakerFlag } from './SpeakerFlag'
import { SpeakerPortrait } from './SpeakerPortrait'

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
  notes,
  onNoteChange,
  onNext,
}: {
  trial: DocketCase
  beatIndex: number
  narration: boolean
  playbackRate: NarrationRate
  notes: SittingNote[]
  onNoteChange: (beatId: string, text: string) => void
  onNext: () => void
}) {
  const beat = trial.beats[beatIndex]
  const turns = beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]
  const [activeDialogue, setActiveDialogue] = useState<{ beatId: string; index: number } | null>(null)
  const [narratorActive, setNarratorActive] = useState(false)
  const [singleSpeakerActive, setSingleSpeakerActive] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [indexOpen, setIndexOpen] = useState(false)
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
  const noteFieldId = useId()
  const indexRegionId = useId()
  const saved = noteForBeat(notes, PLAYER_NOTE_OWNER, beat.id)?.text ?? ''
  const [draft, setDraft] = useState(saved)
  const hasNote = saved.length > 0

  useEffect(() => {
    setDraft(saved)
    setNotesOpen(false)
    setIndexOpen(false)
  }, [beat.id, saved])

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
    const resetSpeakingState = () => {
      setActiveDialogue(null)
      setNarratorActive(false)
      setSingleSpeakerActive(false)
    }
    resetSpeakingState()
    if (!narration) return stopSpeech

    const lines: Array<{ text: string; key: string }> = []
    if (cueText) lines.push({ text: cueText, key: 'narrator' })
    if (beat.turns) {
      lines.push(...beat.turns.map((turn) => ({ text: turn.text, key: turn.speaker })))
    } else {
      lines.push({ text: beat.text, key: beat.speaker })
    }

    if (lines.length === 1) {
      setSingleSpeakerActive(lines[0].key !== 'narrator')
      setNarratorActive(lines[0].key === 'narrator')
      speak(lines[0].text, lines[0].key, resetSpeakingState, playbackRate)
    } else {
      speakAll(lines, {
        rate: playbackRate,
        onLine: (key, index) => {
          setNarratorActive(key === 'narrator')
          setSingleSpeakerActive(!beat.turns && key !== 'narrator')
          if (key === 'narrator') {
            setActiveDialogue(null)
            return
          }
          const dialogueIndex = cueText ? index - 1 : index
          if (dialogueIndex >= 0) setActiveDialogue({ beatId: beat.id, index: dialogueIndex })
        },
        done: resetSpeakingState,
        onError: resetSpeakingState,
      })
    }
    return stopSpeech
  }, [beat, cueText, narration, playbackRate])

  const modeLabel = modeLabelFor(beat)
  const subtitle = [speaker?.role_label, modeLabel].filter(Boolean).join(' · ')

  function commitNote() {
    onNoteChange(beat.id, draft)
  }

  return (
    <div className={`phase-view evidence-view evidence-${beat.kind} space-y-6`}>
      <div className="evidence-toolbar">
        <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
          Evidence {beatIndex + 1} of {total} · {modeLabel}
        </p>
        <div className="evidence-toolbar-actions">
          <button
            type="button"
            className={`evidence-index-toggle${indexOpen ? ' open' : ''}`}
            aria-expanded={indexOpen}
            aria-controls={indexRegionId}
            onClick={() => setIndexOpen((open) => !open)}
          >
            Review your evidence
          </button>
          <button
            type="button"
            className={`note-icon-btn${hasNote ? ' has-note' : ''}${notesOpen ? ' open' : ''}`}
            aria-expanded={notesOpen}
            aria-controls={noteFieldId}
            title={hasNote ? 'Edit your note' : 'Jot a short note'}
            aria-label={hasNote ? 'Edit your recollection note' : 'Jot a short recollection note'}
            onClick={() => setNotesOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="note-icon-svg">
              <path
                fill="currentColor"
                d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V9h4.5L14 4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z"
              />
            </svg>
            {hasNote && <span className="note-dot" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {indexOpen && (
        <div id={indexRegionId}>
          <EvidenceIndex
            trial={trial}
            notes={notes}
            visibleBeatCount={beatIndex + 1}
            selectedBeatId={beat.id}
          />
        </div>
      )}

      {notesOpen && (
        <div className="note-panel" id={noteFieldId}>
          <label htmlFor={`${noteFieldId}-input`} className="note-panel-label">
            Your note · recollection only · max {NOTE_MAX_LEN} characters
          </label>
          <textarea
            id={`${noteFieldId}-input`}
            value={draft}
            maxLength={NOTE_MAX_LEN}
            rows={3}
            placeholder="One line you may want later — not a transcript."
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitNote}
            className="note-textarea"
          />
          <div className="note-panel-actions">
            <span className="note-count">
              {draft.trim().length}/{NOTE_MAX_LEN}
            </span>
            <button type="button" className="note-save-btn" onClick={commitNote}>
              Save note
            </button>
          </div>
        </div>
      )}

      {cueText && <NarratorCue text={cueText} active={narratorActive} />}

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
                  className={`speech-turn rounded-lg border p-4 ${witness ? 'ml-6 border-emerald-900/60 bg-emerald-950/20' : 'mr-6 border-red-900/60 bg-red-950/20'}${activeTurn === index ? ' speech-turn-active' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <SpeakerPortrait trial={trial} speakerId={turn.speaker} />
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-neutral-300">
                        <span>
                          {member?.name ?? turn.speaker}
                          {member?.role_label && (
                            <span className="font-normal text-neutral-500"> · {member.role_label}</span>
                          )}
                        </span>
                        <SpeakerFlag active={activeTurn === index} />
                      </p>
                      <StoryText text={turn.text} className="text-lg leading-relaxed text-neutral-100" />
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        ) : (
          <div
            className={`speech-turn mt-4 flex items-start gap-4 rounded-lg border border-neutral-800 p-4${singleSpeakerActive ? ' speech-turn-active' : ''}`}
            aria-current={singleSpeakerActive ? 'true' : undefined}
          >
            <SpeakerPortrait trial={trial} speakerId={beat.speaker} />
            <div className="min-w-0 flex-1">
              <p className="speaker-heading mb-2">
                <span className="text-sm font-semibold text-neutral-300">
                  {speaker?.name ?? beat.speaker}
                </span>
                <SpeakerFlag active={singleSpeakerActive} />
              </p>
              <StoryText text={beat.text} className="min-h-[6rem] text-lg leading-relaxed text-neutral-100" />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          commitNote()
          onNext()
        }}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        {isLast ? 'Reach a verdict' : 'Next →'}
      </button>
    </div>
  )
}
