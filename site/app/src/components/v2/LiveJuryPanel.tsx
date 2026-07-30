import { useEffect, useMemo, useRef, useState } from 'react'
import { buildHybridTranscript } from '../../engine/liveJurorBridge'
import { liveJuryRoomStatus, type LiveJurySession } from '../../lib/liveJury'
import type { DocketCase } from '../../lib/v2/caseSchema'
import {
  LiveJuryConnection,
  type LivePosition,
  type LiveRoomEvent,
  type LiveRoomSnapshot,
} from '../../lib/liveJuryConnection'
import { SpeakerFlag } from './SpeakerFlag'

const EMPTY_ROOM: LiveRoomSnapshot = {
  status: 'connecting',
  events: [],
  connectedSeats: [],
  stageBySeat: {},
}

const POSITION_LABEL: Record<LivePosition, string> = {
  G: 'Guilty',
  NG: 'Not guilty',
  U: 'Undecided',
}

function humanEventText(event: LiveRoomEvent): string {
  if (event.event_type === 'message') return event.text ?? ''
  const reason = event.reason?.trim()
  return reason
    ? `${POSITION_LABEL[event.position!]} — ${reason}`
    : `Position: ${POSITION_LABEL[event.position!]}`
}

export function LiveJuryPanel({
  session,
  trial,
}: {
  session: LiveJurySession
  trial: DocketCase
}) {
  const [room, setRoom] = useState<LiveRoomSnapshot>(EMPTY_ROOM)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [activeSequence, setActiveSequence] = useState<number | null>(null)
  const connectionRef = useRef<LiveJuryConnection | null>(null)
  const transcriptRef = useRef<HTMLUListElement>(null)
  const lastSequenceRef = useRef(0)
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setRoom(EMPTY_ROOM)
    lastSequenceRef.current = 0
    const connection = new LiveJuryConnection(session, (snapshot) => {
      setRoom(snapshot)
      const latest = snapshot.events.at(-1)?.sequence ?? 0
      if (latest > lastSequenceRef.current) {
        lastSequenceRef.current = latest
        setActiveSequence(latest)
        if (activeTimerRef.current !== null) clearTimeout(activeTimerRef.current)
        activeTimerRef.current = setTimeout(() => {
          activeTimerRef.current = null
          setActiveSequence(null)
        }, 3_500)
      }
    })
    connectionRef.current = connection
    connection.start()
    return () => {
      if (activeTimerRef.current !== null) clearTimeout(activeTimerRef.current)
      activeTimerRef.current = null
      connection.stop()
      connectionRef.current = null
    }
  }, [session])

  useEffect(() => {
    const transcript = transcriptRef.current
    if (transcript) transcript.scrollTop = transcript.scrollHeight
  }, [room.events.length])

  // Announce arrival once the socket is live. Jurors reach this room minutes
  // apart, so the others need to know whether to wait or start without them.
  useEffect(() => {
    if (room.status === 'open') connectionRef.current?.announceStage('juryroom')
  }, [room.status])

  // Everyone who accepted the invitation, whether or not they have reached the
  // jury room. Sockets and stage events only ever describe people who are
  // already here, so counting from those alone tells a host who arrived first
  // that they are the only juror in the room — the one moment this feature
  // exists to speak to. The roster is the denominator instead.
  const [roster, setRoster] = useState<number[]>([])
  useEffect(() => {
    let cancelled = false
    liveJuryRoomStatus(session.roomId, session.inviteToken)
      .then((status) => {
        if (!cancelled) setRoster(status.seats.map((seat) => seat.seatId))
      })
      // The roster is an enrichment: without it the count falls back to who is
      // demonstrably present, which is never wrong, only less complete.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session.inviteToken, session.roomId])

  const knownNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const event of room.events) names.set(event.seat_id, event.display_name)
    names.set(session.seatId, session.displayName)
    return names
  }, [room.events, session.displayName, session.seatId])
  const transcript = useMemo(
    // Stage pings are presence, not deliberation. buildHybridTranscript renders
    // every event it is given as a human contribution, and humanEventText only
    // knows messages and positions — so an arrival used to appear in the room
    // transcript as "Position: undefined".
    () => buildHybridTranscript(trial, room.events.filter((event) => event.event_type !== 'stage')),
    [room.events, trial],
  )

  function sendMessage() {
    try {
      connectionRef.current?.sendMessage(message)
      setMessage('')
      setFeedback('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'That message could not be sent.')
    }
  }

  function sendPosition(position: LivePosition) {
    try {
      connectionRef.current?.sendPosition(position, reason)
      setReason('')
      setFeedback('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'That position could not be sent.')
    }
  }

  const connected = room.status === 'open'
  // Anyone who has announced the jury room (or beyond) is here to deliberate;
  // the rest are still in the trial.
  const seatsKnown = new Set([
    ...roster,
    ...room.connectedSeats,
    ...Object.keys(room.stageBySeat).map(Number),
    session.seatId,
  ])
  const arrived = [...seatsKnown].filter((seat) =>
    room.stageBySeat[seat] === 'juryroom' || room.stageBySeat[seat] === 'verdict',
  ).length
  const waiting = seatsKnown.size - arrived
  const presence = room.connectedSeats.map((seat) =>
    seat === session.seatId
      ? `Seat ${seat}, you`
      : `Seat ${seat}, ${knownNames.get(seat) ?? 'connected'}`,
  )

  return (
    <section
      aria-label="Live human jury"
      className="space-y-4 rounded-lg border border-amber-800/70 bg-amber-950/10 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Live human jury
          </p>
          <h2 className="mt-1 font-semibold text-neutral-100">
            Your private room
          </h2>
        </div>
        <p
          role="status"
          className={`rounded-full border px-2.5 py-1 text-xs ${
            connected
              ? 'border-emerald-800 text-emerald-300'
              : 'border-neutral-700 text-neutral-400'
          }`}
        >
          {room.status === 'open'
            ? `${room.connectedSeats.length} connected`
            : room.status === 'reconnecting'
              ? 'Reconnecting…'
              : room.status === 'superseded'
                ? 'Open in another tab'
                : room.status === 'closed'
                  ? 'Closed'
                  : 'Connecting…'}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-neutral-400">
        Talk with the real people in your invited room. Clearly labelled authored
        jurors also answer each concern using this case&apos;s fixed evidence and
        dialogue rules. Speaker labels distinguish them from live people.
      </p>

      {presence.length > 0 && (
        <p className="text-xs text-neutral-500" aria-label="Connected human seats">
          {presence.join(' · ')}
        </p>
      )}

      <p role="status" className="live-arrivals">
        {arrived === 0
          ? 'Waiting for the others to finish the trial.'
          : waiting === 0
            ? arrived === 1
              ? 'You are the only juror here — the room is yours.'
              : `All ${arrived} jurors have reached the jury room.`
            : `${arrived} of ${arrived + waiting} jurors have reached the jury room — you can start without the rest.`}
      </p>

      <ul
        ref={transcriptRef}
        aria-label="Live human and authored jury transcript"
        className="max-h-64 space-y-2 overflow-y-auto"
      >
        {transcript.length === 0 ? (
          <li className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm text-neutral-500">
            No one has spoken yet. Raise the first question, doubt, or inference.
          </li>
        ) : transcript.map((item) => {
          if (item.kind === 'authored') {
            const active = item.sourceSequence === activeSequence
            return (
              <li
                key={item.key}
                className={`speech-turn rounded-lg border p-3 ${
                  active ? 'speech-turn-active' : 'border-sky-900/70 bg-sky-950/20'
                }`}
                aria-current={active ? 'true' : undefined}
              >
                <p className="speaker-heading text-xs font-semibold text-sky-300">
                  <span>
                    {item.jurorLabel} · Authored juror, not a live person · Reply
                    to message {item.sourceSequence}
                  </span>
                  <SpeakerFlag active={active} />
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                  {item.text}
                </p>
              </li>
            )
          }
          const event = item.event
          const mine = event.seat_id === session.seatId
          const active = event.sequence === activeSequence
          return (
            <li
              key={item.key}
              className={`speech-turn rounded-lg border p-3 ${
                active ? 'speech-turn-active' : 'border-neutral-800 bg-neutral-950/60'
              }`}
              aria-current={active ? 'true' : undefined}
            >
              <p className="speaker-heading text-xs font-semibold text-neutral-400">
                <span>
                  {mine ? 'You' : event.display_name} · Live human · seat {event.seat_id}
                  {' · '}message {event.sequence}
                </span>
                <SpeakerFlag active={active} />
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                {humanEventText(event)}
              </p>
            </li>
          )
        })}
      </ul>

      <div className="space-y-2">
        <label className="block">
          <span className="text-xs font-medium text-neutral-400">
            Raise your own concern or answer another juror
          </span>
          <textarea
            value={message}
            maxLength={500}
            rows={3}
            disabled={!connected}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What does the evidence prove — and what does it leave open?"
            className="mt-1 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm leading-relaxed text-neutral-100 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={!connected || !message.trim()}
          onClick={sendMessage}
          className="w-full rounded-md border border-amber-700 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/40 disabled:opacity-50"
        >
          Send to the jury
        </button>
      </div>

      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <label className="block">
          <span className="text-xs font-medium text-neutral-400">
            Optional reason for your current position
          </span>
          <input
            value={reason}
            maxLength={500}
            disabled={!connected}
            onChange={(event) => setReason(event.target.value)}
            placeholder="The element or doubt that controls your view"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 disabled:opacity-50"
          />
        </label>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Share current position">
          {(['NG', 'U', 'G'] as const).map((position) => (
            <button
              key={position}
              type="button"
              disabled={!connected}
              onClick={() => sendPosition(position)}
              className="rounded-md border border-neutral-700 px-2 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {POSITION_LABEL[position]}
            </button>
          ))}
        </div>
      </div>

      {(feedback || room.error) && (
        <p role="alert" className="text-sm text-amber-200">
          {feedback || room.error}
        </p>
      )}
    </section>
  )
}
