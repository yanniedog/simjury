import { useState } from 'react'
import {
  liveInviteMessage,
  liveInviteUrl,
  type LiveJurySession,
  type LiveSeat,
} from '../../lib/liveJury'

/**
 * Getting other people into your jury room.
 *
 * The old flow was a single "Copy private invitation" button: no way to see
 * whether anyone accepted, no invitation text to send with the link, and a
 * clipboard failure dead end. Hosting felt like shouting into a void.
 *
 * Here the host gets the platform share sheet where it exists, a written
 * invitation they do not have to compose, a permanently visible link as the
 * fallback, and a live roster of who has taken a seat.
 */

export function LiveJuryRoster({
  seats,
  capacity,
  connectedSeats,
  mySeatId,
}: {
  seats: readonly LiveSeat[]
  capacity: number
  /** Seats with an open socket right now, when a connection is running. */
  connectedSeats?: readonly number[]
  mySeatId: number
}) {
  return (
    <div className="roster">
      <p className="roster-head">
        <span>
          {seats.length === 1
            ? 'Just you so far'
            : `${seats.length} of ${capacity} seats taken`}
        </span>
        {seats.length < 2 && (
          <span className="roster-hint">Share the invitation to fill the room</span>
        )}
      </p>
      <ul className="roster-list" aria-label="Jurors in this room">
        {seats.map((seat) => {
          const connected = connectedSeats?.includes(seat.seatId)
          const mine = seat.seatId === mySeatId
          return (
            <li key={seat.seatId} className={`roster-seat${mine ? ' mine' : ''}`}>
              <span className="roster-seat-no" aria-hidden="true">
                {seat.seatId}
              </span>
              <span className="roster-seat-name">
                {mine ? `${seat.displayName} (you)` : seat.displayName}
              </span>
              {connectedSeats && (
                <span className={`roster-dot${connected ? ' on' : ''}`}>
                  <span className="sr-only">
                    {connected ? 'in the room now' : 'not connected'}
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function LiveJuryInvite({
  session,
  caseTitle,
  onMessage,
}: {
  session: LiveJurySession
  caseTitle?: string
  onMessage: (message: string) => void
}) {
  const url = liveInviteUrl(session)
  const [showLink, setShowLink] = useState(false)

  async function share() {
    const text = liveInviteMessage(url, caseTitle)
    // Native share first — on a phone this is the difference between sending an
    // invitation and giving up on one.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'A seat on the jury', text })
        onMessage('Invitation sent.')
        return
      } catch {
        // Dismissing the share sheet is not an error; fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      onMessage('Invitation copied — paste it to whoever you want on the jury.')
    } catch {
      setShowLink(true)
      onMessage('Copying was blocked. Select the link below and copy it.')
    }
  }

  async function copyLinkOnly() {
    try {
      await navigator.clipboard.writeText(url)
      onMessage('Link copied.')
    } catch {
      setShowLink(true)
      onMessage('Copying was blocked. Select the link below and copy it.')
    }
  }

  return (
    <div className="invite">
      <div className="invite-actions">
        <button type="button" onClick={share} className="invite-primary">
          Invite people to this jury
        </button>
        <button type="button" onClick={copyLinkOnly} className="invite-secondary">
          Copy link only
        </button>
        <button
          type="button"
          onClick={() => setShowLink((open) => !open)}
          className="invite-secondary"
          aria-expanded={showLink}
        >
          {showLink ? 'Hide link' : 'Show link'}
        </button>
      </div>
      {showLink && (
        <label className="invite-link">
          <span className="sr-only">Invitation link</span>
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Invitation link"
          />
        </label>
      )}
      <p className="invite-note">
        Anyone with this link takes a seat on your jury. It works until the room
        closes, and it never reveals the verdict.
      </p>
    </div>
  )
}
