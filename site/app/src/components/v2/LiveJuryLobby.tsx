import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearLiveJurySession,
  closeLiveJury,
  hostLiveJury,
  isLiveJuryRevisionError,
  isRoomGoneError,
  joinLiveJury,
  liveInviteFromHash,
  liveInviteFromText,
  liveJuryHealth,
  liveJuryRoomStatus,
  sanitizeDisplayName,
  saveLiveJurySession,
  verifyLiveJurySession,
  type LiveInvite,
  type LiveJurySession,
  type LiveSeat,
} from '../../lib/liveJury'
import { LiveJuryInvite, LiveJuryRoster } from './LiveJuryInvite'

/**
 * The live-jury lobby: matching and onboarding.
 *
 * What used to happen here was a name box and one button. A host could not see
 * whether anyone joined, an invitee got no explanation of what they had been
 * invited to, and anyone who already had the app open could not accept an
 * invitation at all because the link only worked as a cold page load.
 *
 * Now: an invitee sees what the sitting is and how long it takes before they
 * commit; a host sees the roster fill in; and an invitation can be pasted.
 */

/** How often to re-read the roster while the room is still filling. */
const ROSTER_POLL_MS = 5_000

function ExpectationList({ hosting }: { hosting: boolean }) {
  return (
    <ul className="live-expect">
      <li>You each watch the same trial — about 20 minutes.</li>
      <li>The jury room opens after closing arguments, once you get there.</li>
      <li>You deliberate together, then everyone locks their own verdict.</li>
      <li>
        {hosting
          ? 'Anyone you invite can arrive late and catch up — nobody is blocked.'
          : 'You can start the trial now; the room will be waiting.'}
      </li>
    </ul>
  )
}

export function LiveJuryLobby({
  caseId,
  caseTitle,
  derivationRevision,
  session,
  onSession,
}: {
  caseId: string
  caseTitle?: string
  derivationRevision: string
  session: LiveJurySession | null
  onSession: (session: LiveJurySession | null) => void
}) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [sessionReady, setSessionReady] = useState(session === null)
  const [invite, setInvite] = useState(() =>
    typeof window === 'undefined' ? null : liveInviteFromHash(window.location.hash))
  const [name, setName] = useState('')
  const [pasted, setPasted] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [seats, setSeats] = useState<LiveSeat[]>([])
  const [capacity, setCapacity] = useState(12)
  const [expanded, setExpanded] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshRoster = useCallback(async (active: LiveJurySession) => {
    try {
      const status = await liveJuryRoomStatus(active.roomId, active.inviteToken)
      setSeats(status.seats)
      setCapacity(status.capacity)
      return status
    } catch {
      // A roster read failing is not worth interrupting the sitting over; the
      // room itself reports its own health when it matters.
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const health = await liveJuryHealth()
        const ready = health.live_jury_enabled && health.ready
        if (cancelled) return
        setAvailable(ready)
        if (!ready) {
          if (session) {
            clearLiveJurySession(caseId)
            onSession(null)
          }
          setSessionReady(true)
          return
        }
        if (!session) {
          setSessionReady(true)
          return
        }
        try {
          const valid = await verifyLiveJurySession(session, derivationRevision)
          if (cancelled) return
          if (!valid) {
            clearLiveJurySession(caseId)
            onSession(null)
            setMessage('Your live room is no longer available.')
          }
        } catch (error) {
          if (!cancelled) {
            if (isLiveJuryRevisionError(error)) {
              clearLiveJurySession(caseId)
              onSession(null)
              setMessage(error.message)
            } else {
              setMessage('Could not confirm the live room. Controls may be stale until you retry.')
            }
          }
        } finally {
          if (!cancelled) setSessionReady(true)
        }
      } catch {
        if (!cancelled) {
          setAvailable(false)
          setSessionReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // Validate the restored session once per sitting mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only check
  }, [caseId])

  // Poll the roster while a session is live, so a host actually watches people
  // arrive instead of guessing whether their invitation worked.
  //
  // Two things the plain interval got wrong. It kept firing while a slow read
  // was still in flight, so a struggling Worker got a pile of overlapping
  // requests exactly when it could least serve them — `inFlight` drops a tick
  // rather than stacking on one. And this component stays mounted for the whole
  // sitting, so it went on polling long after the room stopped changing; once
  // every seat is taken there is nothing left to watch and the timer stops.
  useEffect(() => {
    if (!session || !sessionReady) return
    let inFlight = false
    const stop = () => {
      if (pollRef.current !== null) clearInterval(pollRef.current)
      pollRef.current = null
    }
    const tick = () => {
      if (inFlight) return
      inFlight = true
      void refreshRoster(session).then((status) => {
        inFlight = false
        if (status && status.seats.length >= status.capacity) stop()
      })
    }
    tick()
    pollRef.current = setInterval(tick, ROSTER_POLL_MS)
    return stop
  }, [session, sessionReady, refreshRoster])

  async function connect(target: LiveInvite | null) {
    const clean = sanitizeDisplayName(name)
    if (!clean) {
      setMessage(
        name.trim()
          ? 'That name cannot be shown to the room. Use up to 32 ordinary characters.'
          : 'Enter the name the other jurors should see.',
      )
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const next = target
        ? await joinLiveJury(target, caseId, clean, derivationRevision)
        : await hostLiveJury(caseId, clean, derivationRevision)
      saveLiveJurySession(next)
      onSession(next)
      setSessionReady(true)
      if (target) history.replaceState(null, '', `${location.pathname}${location.search}`)
    } catch (error) {
      if (isLiveJuryRevisionError(error) && target) {
        history.replaceState(null, '', `${location.pathname}${location.search}`)
        setInvite(null)
      }
      setMessage(error instanceof Error ? error.message : 'The live room could not be joined.')
    } finally {
      setBusy(false)
    }
  }

  function acceptPasted() {
    const parsed = liveInviteFromText(pasted)
    if (!parsed) {
      setMessage('That does not look like a SimJury invitation link.')
      return
    }
    if (parsed.caseId !== caseId) {
      setMessage('That invitation is for a different Daily Docket case.')
      return
    }
    setInvite(parsed)
    setShowPaste(false)
    setPasted('')
    setMessage('Invitation accepted — choose the name the room will see.')
  }

  async function leave() {
    if (!session) return
    setBusy(true)
    setMessage('')
    try {
      await closeLiveJury(session)
      clearLiveJurySession(caseId)
      onSession(null)
      setSeats([])
    } catch (error) {
      if (isRoomGoneError(error) || !session.hostToken) {
        clearLiveJurySession(caseId)
        onSession(null)
        setSeats([])
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : 'The live room could not be closed. Try again.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const activeSession = sessionReady ? session : null
  const checkingSession = Boolean(session) && !sessionReady

  /**
   * An unavailable feature renders nothing — not a panel explaining the
   * absence. The lobby used to occupy the top of every screen announcing
   * "Live rooms aren't open right now", which is an advertisement for a
   * feature the player cannot use. The solo jury is the product, not a
   * fallback to apologise for.
   *
   * `available === null` is the pre-answer state, so it stays silent too;
   * appearing only once rooms are confirmed open avoids a panel that flashes
   * in and then explains itself away.
   */
  if (available !== true && !activeSession && !checkingSession) return null

  return (
    <section className="live-lobby">
      <div className="live-lobby-head">
        <div>
          <p className="live-lobby-kicker">Live jury beta</p>
          <h2 className="live-lobby-title">
            {activeSession
              ? 'Your jury room'
              : invite
                ? 'You have a seat on this jury'
                : 'Deliberate with real people'}
          </h2>
        </div>
        {activeSession && (
          <p className="live-lobby-seat">Seat {activeSession.seatId}</p>
        )}
      </div>

      {checkingSession ? (
        <p className="live-lobby-muted">Confirming your live room…</p>
      ) : activeSession ? (
        <div className="live-lobby-body">
          <LiveJuryRoster
            seats={seats.length > 0 ? seats : [{
              seatId: activeSession.seatId,
              displayName: activeSession.displayName,
            }]}
            capacity={capacity}
            mySeatId={activeSession.seatId}
          />
          {activeSession.hostToken && (
            <LiveJuryInvite
              session={activeSession}
              caseTitle={caseTitle}
              onMessage={setMessage}
            />
          )}
          <details
            className="live-lobby-more"
            open={expanded}
            onToggle={(event) => setExpanded(event.currentTarget.open)}
          >
            <summary>How a shared sitting runs</summary>
            <ExpectationList hosting={Boolean(activeSession.hostToken)} />
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={leave}
            className="live-lobby-leave"
          >
            {activeSession.hostToken ? 'Close this room' : 'Leave this room'}
          </button>
        </div>
      ) : (
        <div className="live-lobby-body">
          <p className="live-lobby-lede">
            {invite
              ? 'Someone kept a seat for you on this jury. You will watch the same trial, then argue it out together.'
              : 'Open a private room and share its invitation with up to eleven people. You watch the same trial, then deliberate together.'}
          </p>
          <ExpectationList hosting={!invite} />
          <label className="live-lobby-field">
            <span className="live-lobby-label">Name the other jurors will see</span>
            <input
              value={name}
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              placeholder="First name is plenty"
              aria-label="Name shown to jurors"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => connect(invite)}
            className="live-lobby-primary"
          >
            {busy
              ? 'Connecting…'
              : invite
                ? 'Take my seat'
                : 'Open a jury room'}
          </button>
          {invite && (
            // An accepted invitation can still turn out to be unusable — the
            // room may be full, expired, or already closed. Without a way back
            // out, the lobby offers only a button that keeps failing and hides
            // the option to host a room instead.
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setInvite(null)
                history.replaceState(null, '', `${location.pathname}${location.search}`)
                setMessage('Invitation discarded. You can open your own room instead.')
              }}
              className="live-lobby-secondary"
            >
              Use a different invitation
            </button>
          )}
          {!invite && (
            <div className="live-lobby-paste">
              {showPaste ? (
                <>
                  <label className="live-lobby-field">
                    <span className="live-lobby-label">Paste an invitation</span>
                    <input
                      value={pasted}
                      onChange={(event) => setPasted(event.target.value)}
                      placeholder="Paste the link someone sent you"
                      aria-label="Paste an invitation link"
                    />
                  </label>
                  <div className="live-lobby-paste-actions">
                    <button type="button" onClick={acceptPasted} className="live-lobby-secondary">
                      Use this invitation
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPaste(false)}
                      className="live-lobby-quiet"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPaste(true)}
                  className="live-lobby-quiet"
                >
                  Someone sent me an invitation
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="live-lobby-message">
          {message}
        </p>
      )}
    </section>
  )
}
