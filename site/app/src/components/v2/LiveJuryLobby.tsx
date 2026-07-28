import { useEffect, useState } from 'react'
import {
  clearLiveJurySession,
  closeLiveJury,
  hostLiveJury,
  isRoomGoneError,
  joinLiveJury,
  liveInviteFromHash,
  liveInviteUrl,
  liveJuryHealth,
  saveLiveJurySession,
  verifyLiveJurySession,
  type LiveJurySession,
} from '../../lib/liveJury'

export function LiveJuryLobby({
  caseId,
  session,
  onSession,
}: {
  caseId: string
  session: LiveJurySession | null
  onSession: (session: LiveJurySession | null) => void
}) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [sessionReady, setSessionReady] = useState(session === null)
  const [invite] = useState(() =>
    typeof window === 'undefined' ? null : liveInviteFromHash(window.location.hash))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

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
          const valid = await verifyLiveJurySession(session)
          if (cancelled) return
          if (!valid) {
            clearLiveJurySession(caseId)
            onSession(null)
            setMessage('Your live room is no longer available.')
          }
        } catch {
          if (!cancelled) {
            setMessage('Could not confirm the live room. Controls may be stale until you retry.')
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

  async function connect(host: boolean) {
    if (!name.trim()) return setMessage('Enter the name the other jurors should see.')
    setBusy(true)
    setMessage('')
    setFallbackUrl(null)
    try {
      const next = host
        ? await hostLiveJury(caseId, name.trim())
        : await joinLiveJury(invite!, caseId, name.trim())
      saveLiveJurySession(next)
      onSession(next)
      setSessionReady(true)
      if (!host) history.replaceState(null, '', `${location.pathname}${location.search}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The live room could not be joined.')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    if (!session) return
    setBusy(true)
    setMessage('')
    try {
      await closeLiveJury(session)
      clearLiveJurySession(caseId)
      onSession(null)
      setFallbackUrl(null)
    } catch (error) {
      if (isRoomGoneError(error) || !session.hostToken) {
        clearLiveJurySession(caseId)
        onSession(null)
        setFallbackUrl(null)
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

  async function copyInvite() {
    if (!session?.hostToken) return
    const url = liveInviteUrl(session)
    try {
      await navigator.clipboard.writeText(url)
      setFallbackUrl(null)
      setMessage('Invitation copied.')
    } catch {
      const fragment = `#live-jury=${session.roomId}.${session.inviteToken}.${session.caseId}`
      history.replaceState(null, '', `${location.pathname}${location.search}${fragment}`)
      setFallbackUrl(url)
      setMessage('Copy was blocked. Select and copy the invitation link below.')
    }
  }

  const activeSession = sessionReady ? session : null
  const checkingSession = Boolean(session) && !sessionReady

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
        Live jury beta
      </p>
      <h2 className="mt-1 font-semibold text-neutral-100">
        Deliberate with real people
      </h2>
      {checkingSession ? (
        <p className="mt-2 text-sm text-neutral-500">Confirming your live room…</p>
      ) : activeSession ? (
        <div className="mt-3 space-y-3 text-sm text-neutral-300">
          <p>
            You have seat {activeSession.seatId}. The live room opens after closing
            arguments so its human jurors can discuss the same case together.
          </p>
          {activeSession.hostToken && (
            <button
              type="button"
              onClick={copyInvite}
              className="w-full rounded-md border border-amber-700 px-3 py-2 font-medium text-amber-100 hover:bg-amber-950/40"
            >
              Copy private invitation
            </button>
          )}
          {fallbackUrl && (
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Invitation link
              </span>
              <input
                readOnly
                value={fallbackUrl}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Invitation link"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100"
              />
            </label>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={leave}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {activeSession.hostToken ? 'Close live room' : 'Leave live room'}
          </button>
        </div>
      ) : available === false ? (
        <p className="mt-2 text-sm text-neutral-400">
          Live rooms aren’t open right now. The solo jury remains fully available.
        </p>
      ) : available === null ? (
        <p className="mt-2 text-sm text-neutral-500">Checking live-room availability…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-neutral-400">
            {invite
              ? 'You’ve been invited to this sitting. Choose the name shown to the room.'
              : 'Start a private room, then share its invitation with up to eleven people.'}
          </p>
          <input
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name shown to jurors"
            aria-label="Name shown to jurors"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
          />
          <button
            type="button"
            disabled={busy || (!invite && !caseId)}
            onClick={() => connect(!invite)}
            className="w-full rounded-md border border-amber-700 px-3 py-2 font-semibold text-amber-100 hover:bg-amber-950/40 disabled:opacity-50"
          >
            {busy ? 'Connecting…' : invite ? 'Join this jury' : 'Host a live jury'}
          </button>
        </div>
      )}
      {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
    </section>
  )
}
