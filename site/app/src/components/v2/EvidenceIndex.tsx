import type { DocketCase } from '../../lib/v2/caseSchema'
import {
  memoryLabel,
  noteForBeat,
  PLAYER_NOTE_OWNER,
  type SittingNote,
} from '../../lib/jurorNotes'

export function EvidenceIndex({
  trial,
  notes,
  visibleBeatCount,
  selectedBeatId,
  raisedBeatIds = [],
  onSelectBeat,
}: {
  trial: DocketCase
  notes: SittingNote[]
  /** Inclusive count of beats the player has already reached. */
  visibleBeatCount: number
  selectedBeatId?: string
  raisedBeatIds?: string[]
  onSelectBeat?: (beatId: string) => void
}) {
  const visible = trial.beats.slice(0, Math.max(0, visibleBeatCount))

  return (
    <div className="evidence-index" role="region" aria-label="Evidence from this sitting">
      <ul className="evidence-index-list">
        {visible.map((beat) => {
          const memory = memoryLabel(trial, beat.id)
          const mine = noteForBeat(notes, PLAYER_NOTE_OWNER, beat.id)
          const selected = beat.id === selectedBeatId
          const raised = raisedBeatIds.includes(beat.id)
          const label = [
            `#${memory.number}`,
            memory.title,
            mine ? 'has your note' : 'memory only',
            raised ? 'already raised' : null,
          ]
            .filter(Boolean)
            .join(' · ')

          const body = (
            <>
              <span className="evidence-index-number" aria-hidden="true">
                {memory.number}
              </span>
              <span className="evidence-index-body">
                <span className="evidence-index-title">{memory.title}</span>
                {mine ? (
                  <span className="evidence-index-note">“{mine.text}”</span>
                ) : (
                  <span className="evidence-index-empty">Memory only</span>
                )}
                {raised ? (
                  <span className="evidence-index-raised">Already raised</span>
                ) : null}
              </span>
            </>
          )

          return (
            <li key={beat.id}>
              {onSelectBeat ? (
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={label}
                  className={`evidence-index-row${selected ? ' selected' : ''}${mine ? ' noted' : ''}${raised ? ' raised' : ''}`}
                  onClick={() => onSelectBeat(beat.id)}
                >
                  {body}
                </button>
              ) : (
                <div
                  className={`evidence-index-row static${mine ? ' noted' : ''}${raised ? ' raised' : ''}`}
                  aria-label={label}
                >
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
