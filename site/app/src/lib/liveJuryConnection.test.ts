import { describe, expect, it, vi } from 'vitest'
import type { LiveJurySession } from './liveJury'
import { LiveJuryConnection, type LiveRoomSnapshot } from './liveJuryConnection'

const session: LiveJurySession = {
  roomId: 'room_12',
  inviteToken: 'i'.repeat(43),
  caseId: 'dd-0039',
  displayName: 'Alex',
  seatId: 1,
  seatToken: 's'.repeat(43),
  derivationRevision: 'hybrid-v1-1234abcd',
}

class FakeSocket {
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  closed?: { code?: number; reason?: string }
  send(value: string) { this.sent.push(value) }
  close(code?: number, reason?: string) { this.closed = { code, reason } }
  open() { this.readyState = 1; this.onopen?.() }
  message(value: object | string) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) })
  }
  end(code: number, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }) }
}

function harness() {
  const sockets: FakeSocket[] = []
  const updates: LiveRoomSnapshot[] = []
  const retries: Array<() => void> = []
  const connection = new LiveJuryConnection(session, (value) => updates.push(value), {
    origin: 'https://simjury.com',
    socketFactory: (url, protocols) => {
      expect(url).toBe('wss://simjury.com/api/live/rooms/room_12/socket')
      expect(protocols).toEqual([
        'simjury-v2',
        session.seatToken,
        session.derivationRevision,
      ])
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    schedule: (callback) => {
      retries.push(callback)
      return 1 as unknown as ReturnType<typeof setTimeout>
    },
    cancel: vi.fn(),
  })
  return { connection, retries, sockets, updates }
}

describe('LiveJuryConnection', () => {
  it('requires an explicit origin outside a browser', () => {
    expect(() => new LiveJuryConnection(session, vi.fn())).toThrow(
      'require a browser origin',
    )
  })

  it('does not open a socket for an unpinned legacy session', () => {
    const updates: LiveRoomSnapshot[] = []
    const socketFactory = vi.fn()
    const connection = new LiveJuryConnection(
      { ...session, derivationRevision: null },
      (value) => updates.push(value),
      { origin: 'https://simjury.com', socketFactory },
    )
    connection.start()
    expect(socketFactory).not.toHaveBeenCalled()
    expect(updates.at(-1)).toMatchObject({
      status: 'closed',
      error: expect.stringContaining('continue solo'),
    })
  })

  it('merges ordered reconnect history and live events without duplicates', () => {
    const { connection, sockets, updates } = harness()
    connection.start()
    sockets[0].open()
    sockets[0].message({
      type: 'welcome',
      history: [
        { type: 'event', event_type: 'message', sequence: 2, seat_id: 2, display_name: 'Sam', text: 'Second' },
        { type: 'event', event_type: 'message', sequence: 1, seat_id: 1, display_name: 'Alex', text: 'First' },
      ],
    })
    sockets[0].message({
      type: 'event', event_type: 'position', sequence: 2,
      seat_id: 2, display_name: 'Sam', position: 'NG',
    })
    expect(updates.at(-1)?.events.map(({ sequence }) => sequence)).toEqual([1, 2])
    expect(updates.at(-1)?.events[1]).toMatchObject({ event_type: 'position', position: 'NG' })
  })

  it('sends bounded messages and positions only while open', () => {
    const { connection, sockets } = harness()
    connection.start()
    expect(() => connection.sendMessage('hello')).toThrow('not connected yet')
    sockets[0].open()
    connection.sendMessage('  What does the clock prove? ')
    connection.sendPosition('U', 'I need an answer.')
    expect(sockets[0].sent.map((value) => JSON.parse(value))).toEqual([
      { type: 'message', text: 'What does the clock prove?' },
      { type: 'position', position: 'U', reason: 'I need an answer.' },
    ])
    expect(() => connection.sendMessage('x'.repeat(501))).toThrow('1–500')
    expect(() => connection.sendPosition('G', 'x'.repeat(501))).toThrow('at most 500')
  })

  it('rejects oversized inbound position reasons and names closed send failures', () => {
    const { connection, sockets, updates } = harness()
    connection.start()
    sockets[0].open()
    sockets[0].message({
      type: 'event',
      event_type: 'position',
      sequence: 1,
      seat_id: 1,
      display_name: 'Alex',
      position: 'G',
      reason: 'x'.repeat(501),
    })
    expect(updates.at(-1)?.events).toEqual([])
    sockets[0].end(1001, 'Host ended the sitting.')
    expect(updates.at(-1)?.status).toBe('closed')
    expect(() => connection.sendMessage('hello')).toThrow('live room is closed')
  })

  it('reconnects transient failures but stops a superseded seat', () => {
    const { connection, retries, sockets, updates } = harness()
    connection.start()
    sockets[0].end(1006)
    expect(updates.at(-1)?.status).toBe('reconnecting')
    expect(() => connection.sendMessage('hello')).toThrow('reconnecting')
    retries[0]()
    expect(sockets).toHaveLength(2)
    sockets[1].end(4001)
    expect(updates.at(-1)).toMatchObject({
      status: 'superseded',
      error: 'This seat reconnected in another tab.',
    })
    expect(() => connection.sendMessage('hello')).toThrow('another tab')
    expect(retries).toHaveLength(1)
  })

  it('tracks presence and ignores malformed server messages', () => {
    const { connection, sockets, updates } = harness()
    connection.start()
    sockets[0].open()
    sockets[0].message('{not json')
    sockets[0].message({
      type: 'event', event_type: 'message', sequence: -1,
      seat_id: 19, display_name: '', text: 'malformed',
    })
    sockets[0].message({ type: 'presence', connected_seats: [3, 1, 3, 19, '2'] })
    expect(updates.at(-1)?.connectedSeats).toEqual([1, 3])
    connection.stop()
    expect(sockets[0].closed).toEqual({ code: 1000, reason: 'Leaving live jury' })
  })
})
