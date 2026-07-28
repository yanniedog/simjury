import { useEffect, useState } from 'react'
import {
  clearLiveJurySession,
  closeLiveJury,
  hostLiveJury,
  joinLiveJury,
  liveInviteFromHash,
  liveInviteUrl,
  liveJuryHealth,
  saveLiveJurySession,
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
  const [invite] = useState(() =>
    typeof window === 'undefined' ? null : liveInviteFromHash(window.location.hash))
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    liveJuryHealth()
      .then((health) => setAvailable(health.live_jury_enabled && health.ready))
      .catch(() => setAvailable(false))
  }, [])

  async function connect(host: boolean) {
    if (!name.trim()) return setMessage('Enter the name the other jurors should see.')
    setBusy(true)
    setMessage('')
    try {
      const next = host
        ? await hostLiveJury(caseId, name.trim())
        : await joinLiveJury(invite!, caseId, name.trim())
      saveLiveJurySession(next)
      onSession(next)
      if (!host) history.replaceState(null, '', `${location.pathname}${location.search}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The live room could not be joined.')
    } finally {
      setBusy(false)
    }
  }

  async function leave() {
    setBusy(true)
    try {
      await closeLiveJury(session!)
    } catch {
      // A local exit must remain available if the room has already expired.
    }
    clearLiveJurySession(caseId)
    onSession(null)
    setBusy(false)
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(liveInviteUrl(session!))
      setMessage('Invitation copied.')
    } catch {
      setMessage('Copy was blocked. Use your browser’s address bar to share this page.')
    }
  }

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
        Live jury beta
      </p>
      <h2 className="mt-1 font-semibold text-neutral-100">
        Deliberate with real people
      </h2>
      {session ? (
        <div className="mt-3 space-y-3 text-sm text-neutral-300">
          <p>
            You have seat {session.seatId}. The live room opens after closing
            arguments so its human jurors can discuss the same case together.
          </p>
          {session.hostToken && (
            <button
              type="button"
              onClick={copyInvite}
              className="w-full rounded-md border border-amber-700 px-3 py-2 font-medium text-amber-100 hover:bg-amber-950/40"
            >
              Copy private invitation
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={leave}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            {session.hostToken ? 'Close live room' : 'Leave live room'}
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
            disabled={busy}
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
