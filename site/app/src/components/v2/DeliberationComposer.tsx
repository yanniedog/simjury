import { useMemo } from 'react'
import type { JurorProfile } from '../../engine/jurorProfile'
import type { JurorRelation } from '../../engine/persuasion'
import type { PlayerClaim, PlayerMove } from '../../engine/persuasion'
import {
  claimApplies,
  MOVE_HINT,
  MOVE_LABEL,
  movesForBeatKind,
} from '../../lib/moveCopy'
import { memoryLabel, type SittingNote } from '../../lib/jurorNotes'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { EvidenceIndex } from './EvidenceIndex'

/**
 * The deliberation composer.
 *
 * The room used to accept one shape of contribution: pick a recollection, then
 * press one of three direction buttons. That made every juror answerable by the
 * same lever, so persuasion was a dice roll on authored weights.
 *
 * Here the *technique* and the *direction* are separate choices. Technique is
 * what the persuasion model scores against a juror's personality; direction is
 * still which way the point cuts. `assert` is preselected, so the fast path is
 * exactly as quick as before — the depth is opt-in rather than mandatory.
 */

const CLAIM_COPY: Record<PlayerClaim, string> = {
  NG: 'This raises doubt',
  G: 'This supports guilt',
  U: 'Ask the room to test it',
}

export function DeliberationComposer({
  trial,
  notes,
  profiles,
  relations,
  selectedBeatId,
  raisedBeatIds,
  move,
  claim,
  targetJurorId,
  supportBeatId,
  concernText,
  feedback,
  overrideBeat,
  onSelectBeat,
  onMoveChange,
  onClaimChange,
  onTargetChange,
  onSupportChange,
  onConcernChange,
  onSubmit,
  onCancel,
}: {
  trial: DocketCase
  notes: SittingNote[]
  profiles: readonly JurorProfile[]
  relations: Record<string, JurorRelation>
  selectedBeatId: string
  raisedBeatIds: string[]
  move: PlayerMove
  claim: PlayerClaim
  targetJurorId: string
  supportBeatId: string
  concernText: string
  feedback: string | null
  /** True once the room has asked which recollection the player meant. */
  overrideBeat: boolean
  onSelectBeat: (beatId: string) => void
  onMoveChange: (move: PlayerMove) => void
  onClaimChange: (claim: PlayerClaim) => void
  onTargetChange: (jurorId: string) => void
  onSupportChange: (beatId: string) => void
  onConcernChange: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const beat = trial.beats.find((b) => b.id === selectedBeatId) ?? trial.beats[0]
  const available = movesForBeatKind(beat.kind)
  const showClaim = claimApplies(move) && beat.kind !== 'direction'
  const target = profiles.find(({ id }) => id === targetJurorId)

  // A chain only counts when the second recollection shares a theme with the
  // first, so only offer the ones that would actually land.
  const supportOptions = useMemo(
    () =>
      trial.beats.filter(
        (candidate) =>
          candidate.id !== beat.id
          && candidate.kind !== 'direction'
          && candidate.tags.some((tag) => beat.tags.includes(tag)),
      ),
    [trial.beats, beat],
  )

  const memory = memoryLabel(trial, beat.id)

  return (
    <div className="composer" role="group" aria-label="Raise a point with the room">
      <div className="composer-head">
        <p className="composer-step">Your turn</p>
        <h2 className="composer-title">Raise a point</h2>
      </div>

      <label className="composer-field">
        <span className="composer-label">In your own words</span>
        <textarea
          value={concernText}
          maxLength={500}
          rows={3}
          onChange={(event) => onConcernChange(event.target.value)}
          placeholder="For example: the access log shows the device, not who was holding it."
          className="composer-textarea"
        />
        <span className="composer-count">{concernText.length}/500</span>
      </label>

      {feedback && (
        <div role="status" className="composer-feedback">
          {feedback}
        </div>
      )}

      <fieldset className="composer-field">
        <legend className="composer-label">How do you want to put it?</legend>
        <div className="move-grid">
          {available.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={move === option}
              onClick={() => onMoveChange(option)}
              className={`move-card${move === option ? ' selected' : ''}`}
            >
              <span className="move-card-label">{MOVE_LABEL[option]}</span>
              <span className="move-card-hint">{MOVE_HINT[option]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {move === 'connect_evidence' && (
        <label className="composer-field">
          <span className="composer-label">Tie it to</span>
          {supportOptions.length === 0 ? (
            <span className="composer-note">
              Nothing else in this sitting shares a theme with #{memory.number}, so
              a chain would not hold. Another technique will land harder.
            </span>
          ) : (
            <select
              value={supportBeatId}
              onChange={(event) => onSupportChange(event.target.value)}
              className="composer-select"
            >
              <option value="">Choose a second recollection</option>
              {supportOptions.map((option) => {
                const label = memoryLabel(trial, option.id)
                return (
                  <option key={option.id} value={option.id}>
                    #{label.number} · {label.title}
                  </option>
                )
              })}
            </select>
          )}
        </label>
      )}

      {showClaim && (
        <fieldset className="composer-field">
          <legend className="composer-label">Which way does it cut?</legend>
          <div className="claim-row">
            {(['NG', 'G', 'U'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={claim === option}
                onClick={() => onClaimChange(option)}
                className={`claim-btn${claim === option ? ' selected' : ''}`}
              >
                {CLAIM_COPY[option]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="composer-field">
        <span className="composer-label">
          {move === 'ask_reason' ? 'Ask which juror?' : 'Address'}
        </span>
        <select
          value={targetJurorId}
          onChange={(event) => onTargetChange(event.target.value)}
          className="composer-select"
        >
          <option value="">The whole room</option>
          {[...profiles]
            .sort((a, b) => a.seat - b.seat)
            .map((profile) => (
              <option key={profile.id} value={profile.id}>
                Seat {profile.seat} · {profile.label}
              </option>
            ))}
        </select>
        {target && (
          <span className="composer-note">
            {target.persona}
            {relations[target.id]?.pressed >= 2
              ? ' You have already pressed them twice — another direct push will cost you.'
              : ''}
          </span>
        )}
      </label>

      <div className="composer-field">
        <span className="composer-label">
          Which recollection does this hang on?
        </span>
        <EvidenceIndex
          trial={trial}
          notes={notes}
          visibleBeatCount={trial.beats.length}
          selectedBeatId={selectedBeatId}
          raisedBeatIds={raisedBeatIds}
          onSelectBeat={onSelectBeat}
        />
      </div>

      <div className="composer-actions">
        <button type="button" onClick={onSubmit} className="composer-send">
          {overrideBeat
            ? `Use #${memory.number} anyway`
            : move === 'ask_reason'
              ? 'Put the question'
              : 'Put it to the room'}
        </button>
        <button type="button" onClick={onCancel} className="composer-cancel">
          Never mind — keep the agenda moving
        </button>
      </div>
    </div>
  )
}
