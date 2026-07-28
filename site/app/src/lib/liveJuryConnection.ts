import type { LiveJurySession } from './liveJury'

export type LivePosition = 'G' | 'NG' | 'U'

export interface LiveRoomEvent {
  type: 'event'
  event_type: 'message' | 'position'
  sequence: number
  seat_id: number
  display_name: string
  text?: string
  position?: LivePosition
  reason?: string
  created_at?: number
}

export interface LiveRoomSnapshot {
  status: 'connecting' | 'open' | 'reconnecting' | 'closed' | 'superseded'
  events: LiveRoomEvent[]
  connectedSeats: number[]
  error?: string
}

interface SocketLike {
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number; reason: string }) => void) | null
  onerror: (() => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface LiveConnectionOptions {
  origin?: string
  socketFactory?: (url: string, protocols: string[]) => SocketLike
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}

function eventFrom(value: unknown): LiveRoomEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Partial<LiveRoomEvent>
  if (
    event.type !== 'event'
    || !['message', 'position'].includes(event.event_type ?? '')
    || !Number.isInteger(event.sequence)
    || (event.sequence ?? 0) < 1
    || !Number.isInteger(event.seat_id)
    || (event.seat_id ?? 0) < 1
    || (event.seat_id ?? 0) > 12
    || typeof event.display_name !== 'string'
    || event.display_name.trim().length < 1
  ) return null
  if (
    event.event_type === 'message'
    && (typeof event.text !== 'string' || event.text.length > 500)
  ) return null
  if (event.event_type === 'position') {
    if (!['G', 'NG', 'U'].includes(event.position ?? '')) return null
    if (event.reason !== undefined && (
      typeof event.reason !== 'string' || event.reason.length > 500
    )) return null
  }
  return event as LiveRoomEvent
}

function socketUrl(origin: string, roomId: string): string {
  const url = new URL(`/api/live/rooms/${encodeURIComponent(roomId)}/socket`, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export class LiveJuryConnection {
  private socket: SocketLike | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private attempts = 0
  private events = new Map<number, LiveRoomEvent>()
  private snapshot: LiveRoomSnapshot = {
    status: 'connecting',
    events: [],
    connectedSeats: [],
  }

  private readonly origin: string
  private readonly socketFactory: NonNullable<LiveConnectionOptions['socketFactory']>
  private readonly schedule: NonNullable<LiveConnectionOptions['schedule']>
  private readonly cancel: NonNullable<LiveConnectionOptions['cancel']>

  constructor(
    private readonly session: LiveJurySession,
    private readonly onUpdate: (snapshot: LiveRoomSnapshot) => void,
    options: LiveConnectionOptions = {},
  ) {
    const browserOrigin =
      typeof window === 'undefined' ? undefined : window.location.origin
    if (!options.origin && !browserOrigin) {
      throw new Error('Live jury connections require a browser origin.')
    }
    this.origin = options.origin ?? browserOrigin!
    this.socketFactory = options.socketFactory ?? ((url, protocols) =>
      new WebSocket(url, protocols) as unknown as SocketLike)
    this.schedule = options.schedule ?? setTimeout
    this.cancel = options.cancel ?? clearTimeout
  }

  start(): void {
    if (this.socket || this.stopped) return
    this.connect('connecting')
  }

  stop(): void {
    this.stopped = true
    if (this.retryTimer !== null) this.cancel(this.retryTimer)
    this.retryTimer = null
    this.socket?.close(1000, 'Leaving live jury')
    this.socket = null
    this.publish({ status: 'closed' })
  }

  sendMessage(text: string): void {
    const clean = text.trim()
    if (!clean || clean.length > 500) throw new Error('A message must be 1–500 characters.')
    this.send({ type: 'message', text: clean })
  }

  sendPosition(position: LivePosition, reason?: string): void {
    const clean = reason?.trim()
    if (!['G', 'NG', 'U'].includes(position)) throw new Error('Unknown jury position.')
    if (clean && clean.length > 500) throw new Error('A reason must be at most 500 characters.')
    this.send({ type: 'position', position, ...(clean ? { reason: clean } : {}) })
  }

  private send(value: object): void {
    if (!this.socket || this.socket.readyState !== 1) {
      const status = this.snapshot.status
      if (status === 'closed') {
        throw new Error('The live room is closed.')
      }
      if (status === 'superseded') {
        throw new Error('This seat reconnected in another tab.')
      }
      if (status === 'reconnecting') {
        throw new Error('The live room is reconnecting. Try again in a moment.')
      }
      throw new Error('The live room is not connected yet. Try again in a moment.')
    }
    this.socket.send(JSON.stringify(value))
  }

  private connect(status: LiveRoomSnapshot['status']): void {
    this.publish({ status, error: undefined })
    const socket = this.socketFactory(
      socketUrl(this.origin, this.session.roomId),
      ['simjury-v1', this.session.seatToken],
    )
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.attempts = 0
      this.publish({ status: 'open', error: undefined })
    }
    socket.onmessage = ({ data }) => {
      if (this.socket !== socket || typeof data !== 'string') return
      this.receive(data)
    }
    socket.onerror = () => {
      if (this.socket === socket) this.publish({ error: 'The live connection was interrupted.' })
    }
    socket.onclose = ({ code, reason }) => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.stopped || code === 1000) {
        this.publish({ status: 'closed', error: undefined })
      } else if (code === 1001) {
        this.publish({
          status: 'closed',
          error: reason || 'The host closed this live jury.',
        })
      } else if (code === 4001) {
        this.publish({ status: 'superseded', error: 'This seat reconnected in another tab.' })
      } else if (this.attempts >= 5) {
        this.publish({ status: 'closed', error: reason || 'The live room could not reconnect.' })
      } else {
        const delay = Math.min(500 * 2 ** this.attempts++, 5_000)
        this.publish({ status: 'reconnecting' })
        this.retryTimer = this.schedule(() => {
          this.retryTimer = null
          if (!this.stopped) this.connect('reconnecting')
        }, delay)
      }
    }
  }

  private receive(raw: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (message.type === 'welcome' && Array.isArray(message.history)) {
      for (const value of message.history) this.remember(eventFrom(value))
      this.publish()
      return
    }
    const event = eventFrom(message)
    if (event) {
      this.remember(event)
      this.publish()
    } else if (message.type === 'presence' && Array.isArray(message.connected_seats)) {
      const connectedSeats = message.connected_seats
        .filter((seat): seat is number => Number.isInteger(seat) && seat >= 1 && seat <= 12)
      this.publish({ connectedSeats: [...new Set(connectedSeats)].sort((a, b) => a - b) })
    } else if (message.type === 'error' && typeof message.code === 'string') {
      this.publish({ error: message.code === 'INVALID_EVENT'
        ? 'That contribution could not be understood.'
        : 'The live room rejected that contribution.' })
    }
  }

  private remember(event: LiveRoomEvent | null): void {
    if (!event) return
    this.events.set(event.sequence, event)
    while (this.events.size > 480) this.events.delete(Math.min(...this.events.keys()))
  }

  private publish(change: Partial<LiveRoomSnapshot> = {}): void {
    this.snapshot = {
      ...this.snapshot,
      ...change,
      events: [...this.events.values()].sort((a, b) => a.sequence - b.sequence),
    }
    this.onUpdate({
      ...this.snapshot,
      events: [...this.snapshot.events],
      connectedSeats: [...this.snapshot.connectedSeats],
    })
  }
}
