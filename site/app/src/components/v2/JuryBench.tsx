import type { JurorSeat } from '../../lib/v2/jurorSeats'
import { mediaAssetSrc } from '../../lib/v2/mediaAssets'
import type { Verdict } from './DocketVerdict'

/**
 * The twelve seats — as twelve people.
 *
 * Each seat carries the portrait, the given name the transcript uses, and a
 * mark for how that juror is reached. The speaking seat lifts and rings in
 * brass so a line in the transcript can be matched to a face.
 *
 * Leanings stay sealed until the judge reads the result; before then a seat
 * shows only who is speaking and who was just stirred. See
 * docs/DESIGN-PROTOCOL.md rule 8.
 */

function SeatFace({ seat }: { seat: JurorSeat }) {
  return (
    <>
      {seat.portrait ? (
        <img
          className="jury-seat-portrait"
          src={mediaAssetSrc(seat.portrait.src)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        // A juror without an authored portrait still gets a face-shaped slot,
        // so the bench does not reflow between cases.
        <span className="jury-seat-portrait jury-seat-portrait-empty" aria-hidden="true">
          {seat.name.slice(0, 1)}
        </span>
      )}
      <span className="jury-seat-name" aria-hidden="true">{seat.name}</span>
      <span className="jury-seat-style" aria-hidden="true" title={seat.styleLabel}>
        {seat.glyph}
      </span>
    </>
  )
}

export function JuryBench({
  seats,
  playerVerdict,
  activeJurorId,
  stirredIds = [],
  revealPositions = false,
  positionOf,
  onOpenJuror,
}: {
  seats: readonly JurorSeat[]
  playerVerdict?: Verdict | null
  activeJurorId?: string | null
  stirredIds?: readonly string[]
  /** Only ever true once the judge has read the result. */
  revealPositions?: boolean
  /** Sealed until `revealPositions`; the bench never reads it before then. */
  positionOf?: (jurorId: string) => number
  /** Opens that juror's dossier — the seats are how you learn who these people are. */
  onOpenJuror?: (jurorId: string) => void
}) {
  const playerMark = revealPositions && playerVerdict
    ? (playerVerdict === 'Guilty' ? 'G' : playerVerdict === 'Not Guilty' ? 'NG' : '—')
    : null

  return (
    <div className="jury-table" role="list" aria-label="The twelve jury seats">
      <div role="listitem" className="jury-seat player">
        <span className="sr-only">
          {`Seat 1, you${revealPositions && playerVerdict ? `, ${playerVerdict}` : ', deliberating'}`}
        </span>
        <span className="jury-seat-portrait jury-seat-portrait-empty" aria-hidden="true">◆</span>
        <span className="jury-seat-name" aria-hidden="true">You</span>
        {playerMark && <span className="jury-seat-mark" aria-hidden="true">{playerMark}</span>}
      </div>

      {seats.map((seat) => {
        const isActive = seat.id === activeJurorId
        const stirred = stirredIds.includes(seat.id)
        const position = revealPositions && positionOf ? positionOf(seat.id) : null
        const lean = position === null
          ? null
          : position > 0 ? 'Guilty' : position < 0 ? 'Not guilty' : 'Undecided'
        const mark = position === null
          ? null
          : position > 0 ? 'G' : position < 0 ? 'NG' : '—'
        const tone = [
          'jury-seat',
          isActive ? 'active' : '',
          stirred && !isActive ? 'stirred' : '',
          lean ? `lean-${lean.split(' ')[0].toLowerCase()}` : '',
        ].filter(Boolean).join(' ')
        const caption = `Seat ${seat.seat}, ${seat.name}${seat.role ? `, ${seat.role}` : ''}`
          + `. ${seat.styleLabel}`
          + `${lean ? `. ${lean}` : ''}`
          + `${isActive ? '. Speaking now' : ''}`

        if (!onOpenJuror) {
          return (
            <div
              key={seat.id}
              role="listitem"
              aria-current={isActive ? 'true' : undefined}
              className={tone}
            >
              <span className="sr-only">{caption}</span>
              <SeatFace seat={seat} />
              {mark && <span className="jury-seat-mark" aria-hidden="true">{mark}</span>}
            </div>
          )
        }
        return (
          <div key={seat.id} role="listitem" className="jury-seat-cell">
            <button
              type="button"
              aria-current={isActive ? 'true' : undefined}
              className={`${tone} interactive`}
              onClick={() => onOpenJuror(seat.id)}
            >
              <span className="sr-only">{`${caption}. Open their dossier.`}</span>
              <SeatFace seat={seat} />
              {mark && <span className="jury-seat-mark" aria-hidden="true">{mark}</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
