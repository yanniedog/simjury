import type { RoomEvent } from '../../engine/deliberation'
import {
  memoryLabel,
  noteForBeat,
  PLAYER_NOTE_OWNER,
  type SittingNote,
} from '../../lib/jurorNotes'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { SpeakerFlag } from './SpeakerFlag'
import { SpeakerPortrait } from './SpeakerPortrait'

/** One line of the room record: a speech, a raise, a sealed vote, a drift. */
function actorLabel(e: RoomEvent, trial: DocketCase): string {
  if (e.actor === 'player') return 'You'
  if (e.actor === 'room') return 'The room'
  return trial.jury.jurors.find((j) => j.id === e.actor)?.label ?? 'A juror'
}

function ownerIdForActor(actor: string): string | null {
  if (actor === 'player') return PLAYER_NOTE_OWNER
  if (actor === 'room' || actor === 'judge') return null
  return actor
}

function writtenRecord(
  notes: SittingNote[],
  actor: string,
  beatId: string | undefined,
): SittingNote | undefined {
  if (!beatId) return undefined
  const ownerId = ownerIdForActor(actor)
  if (!ownerId) return undefined
  return noteForBeat(notes, ownerId, beatId)
}

export function FeedLine({
  e,
  trial,
  notes,
  revealVotes,
  active,
}: {
  e: RoomEvent
  trial: DocketCase
  notes: SittingNote[]
  revealVotes: boolean
  active: boolean
}) {
  if (e.type === 'respond' && e.line) {
    const juror = trial.jury.jurors.find((j) => j.id === e.actor)
    return (
      <li
        className={`room-line speech-turn border p-3${active ? ' speech-turn-active' : ''}`}
        aria-current={active ? 'true' : undefined}
        data-event-tick={e.tick}
      >
        <div className="flex items-start gap-3">
          <SpeakerPortrait trial={trial} speakerId={e.actor} className="h-16 w-14" />
          <div className="min-w-0">
            <p className="speaker-heading text-xs font-semibold text-neutral-400">
              <span>{juror?.label ?? e.actor}</span>
              <SpeakerFlag active={active} />
            </p>
            <p className="mt-1 text-sm text-neutral-200">{e.line}</p>
          </div>
        </div>
      </li>
    )
  }
  if (e.type === 'argue' || e.type === 'cite') {
    const who = actorLabel(e, trial)
    const verb = who === 'You' ? 'raise' : 'raises'
    const memory = e.beatId ? memoryLabel(trial, e.beatId) : null
    const note = writtenRecord(notes, e.actor, e.beatId)
    const stance =
      e.type === 'cite'
        ? `${verb} the judge’s direction from memory.`
        : e.stance === 'proves'
          ? `${verb} a point from recollection.`
          : e.stance === 'probe'
            ? who === 'You'
              ? 'ask the room to test that recollection.'
              : 'asks the room to test that recollection.'
            : who === 'You'
              ? 'challenge whether that recollection holds.'
              : 'challenges whether that recollection holds.'
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3">
        <p className="text-xs font-semibold text-neutral-300">{who}</p>
        <p className="mt-1 text-sm text-neutral-200">
          {who === 'You' ? `You ${stance}` : `${who} ${stance}`}
        </p>
        {who === 'You' && e.detail && (
          <blockquote className="mt-2 border-l border-amber-700/60 pl-3 text-sm leading-relaxed text-neutral-200">
            “{e.detail}”
          </blockquote>
        )}
        {note ? (
          <p className="mt-2 border-l border-amber-700/50 pl-3 text-xs leading-relaxed text-neutral-300">
            Note · #{memory?.number ?? '?'}: “{note.text}”
          </p>
        ) : (
          <p className="mt-2 border-l border-neutral-600 pl-3 text-xs leading-relaxed text-neutral-500">
            From memory · #{memory?.number ?? '?'} · {memory?.title ?? 'a sitting point'}
            {' — no written note'}
          </p>
        )}
      </li>
    )
  }
  if (e.type === 'pass') {
    return (
      <li className="room-pass rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-400">
        {e.actor === 'player'
          ? 'You let this point pass.'
          : 'No new issue raised — the room talks on.'}
      </li>
    )
  }
  if (e.type === 'vote' && e.tally) {
    if (!revealVotes) {
      return (
        <li className="room-hands-sealed rounded-lg border border-neutral-700 bg-neutral-900/70 p-3 text-center text-sm text-neutral-400">
          A private show of hands — sealed until the judge speaks.
        </li>
      )
    }
    return (
      <li className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-center text-sm text-neutral-300">
        A show of hands: <b className="text-red-300">{e.tally.g} guilty</b> ·{' '}
        <b className="text-emerald-300">{e.tally.ng} not guilty</b>
        {e.tally.u > 0 && <> · {e.tally.u} undecided</>}
      </li>
    )
  }
  if (e.type === 'majority_direction' && revealVotes) {
    return (
      <li className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-center text-sm text-amber-200">
        The judge: “{e.detail}”
      </li>
    )
  }
  if (e.type === 'drift_corrected') {
    return (
      <li className="px-3 text-xs italic text-emerald-400">
        You put the burden back where it belongs.
      </li>
    )
  }
  return null
}

