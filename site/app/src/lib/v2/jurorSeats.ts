import { jurorProfiles } from '../../engine/jurorProfile'
import type { PersuasionStyle } from '../../engine/jurorProfile'
import type { CourtroomTrial, MediaAsset } from './caseSchema'

/**
 * A jury seat as the player should meet it: a person, not a number.
 *
 * The eleven jurors have authored personas, portraits, persuasion styles and
 * their own notes. The bench rendered them as twelve numbered boxes containing
 * a middle dot, while the transcript below attributed lines to names and the
 * dossier lived behind a mode switch — three identity systems that never met,
 * so a player who heard Rami say something could not find Rami.
 *
 * This is the one place a seat is described, so the V3 and V4 rooms show the
 * same person in the same way.
 *
 * Nothing here exposes a leaning or a tally. Those stay sealed until the judge
 * reads the result; style and name are about approach, not position. See
 * docs/DESIGN-PROTOCOL.md rule 8.
 */

export interface JurorSeat {
  id: string
  seat: number
  /** The name the transcript uses, so the two can be matched by eye. */
  name: string
  /** "foreperson" and similar, authored after a middle dot in the label. */
  role: string | null
  portrait: MediaAsset | null
  style: PersuasionStyle
  styleLabel: string
  /** A mark for the style. Always paired with the label — never colour alone. */
  glyph: string
}

/** Short handles for the bench. The dossier carries the full explanation. */
export const SEAT_STYLE_MARK: Record<PersuasionStyle, { label: string; glyph: string }> = {
  wants_a_source: { label: 'Wants a source', glyph: '⌕' },
  follows_the_bench: { label: 'Follows the bench', glyph: '§' },
  moves_with_the_room: { label: 'Moves with the room', glyph: '≈' },
  holds_the_line: { label: 'Holds the line', glyph: '‖' },
  wants_it_finished: { label: 'Wants it finished', glyph: '»' },
}

/**
 * Labels are authored as `Vela · foreperson`. The bench shows the given name,
 * which is what the transcript attributes lines to, and carries the role
 * separately rather than running the two together in one string.
 */
export function splitJurorLabel(label: string): { name: string; role: string | null } {
  const [name, ...rest] = label.split('·').map((part) => part.trim())
  return { name: name || label, role: rest.length > 0 ? rest.join(' · ') : null }
}

export function jurorSeats(trial: CourtroomTrial): JurorSeat[] {
  const portraits = trial.media?.portraits ?? {}
  return jurorProfiles(trial.jury.jurors)
    .map((profile) => {
      const { name, role } = splitJurorLabel(profile.label)
      const mark = SEAT_STYLE_MARK[profile.style]
      return {
        id: profile.id,
        seat: profile.seat,
        name,
        role,
        portrait: portraits[profile.id] ?? null,
        style: profile.style,
        styleLabel: mark.label,
        glyph: mark.glyph,
      }
    })
    .sort((left, right) => left.seat - right.seat)
}
