import { SpeakerFlag } from './SpeakerFlag'

/**
 * What the narrator is saying — only when the narrator is speaking.
 *
 * This used to render unconditionally. With narration off, which is the
 * default, every phase still showed a prominent gold-bordered block containing
 * the words that would have been spoken: the briefing read its own setting
 * paragraph back one element after it appeared under the title, and the jury
 * room gave six lines of procedure more visual weight than the testimony they
 * introduced.
 *
 * Narration is meant to be an alternative to reading the screen. Printing the
 * script above the thing it describes makes it a duplicate instead. Off: this
 * renders nothing. On: a caption subordinate to the testimony, tied to
 * playback state.
 *
 * See docs/DESIGN-PROTOCOL.md rule 4.
 */
export function NarratorCue({
  text,
  narration,
  active = false,
}: {
  text: string
  /** Whether narration is switched on. Off renders nothing at all. */
  narration: boolean
  active?: boolean
}) {
  if (!narration) return null
  return (
    <aside
      className={`narrator-cue${active ? ' narrator-cue-active' : ''}`}
      aria-label={`Narrator${active ? ', speaking' : ''}`}
      aria-current={active ? 'true' : undefined}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="narrator-cue-label">
        <span className="chrome-label">Narrator</span>
        <SpeakerFlag active={active} />
      </p>
      <p className="narrator-cue-text">{text}</p>
    </aside>
  )
}
