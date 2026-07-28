import {
  FREE_BETA_LIMITS,
  admissionDecision,
  decodeOpaqueId,
  isLiveRoute,
  liveJuryEnabled,
  parseOpaqueId,
  parseSeatId,
  roomExpiryCutoff,
  seatMaySend,
  unavailable,
} from './live-policy.js'

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export class PoolCoordinatorDO {
  constructor(state, env) {
    this.state = state
    this.env = env
    state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS admissions (
        admission_id TEXT PRIMARY KEY,
        utc_day TEXT NOT NULL,
        room_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS active_rooms (
        room_id TEXT PRIMARY KEY,
        opened_at INTEGER NOT NULL
      );
    `)
  }

  async fetch(request) {
    if (!liveJuryEnabled(this.env)) return unavailable()
    const { pathname } = new URL(request.url)
    if (request.method === 'POST' && pathname === '/internal/admit') {
      let body
      try {
        body = await request.json()
      } catch {
        return unavailable('INVALID_JSON', 400)
      }
      const admissionId = parseOpaqueId(body?.admissionId)
      const roomId = parseOpaqueId(body?.roomId)
      if (!admissionId || !roomId) {
        return unavailable('INVALID_ADMISSION', 400)
      }
      const utcDay = new Date().toISOString().slice(0, 10)
      this.state.storage.sql.exec('DELETE FROM admissions WHERE utc_day <> ?', utcDay)
      this.state.storage.sql.exec('DELETE FROM active_rooms WHERE opened_at <= ?', roomExpiryCutoff())
      const duplicate = [...this.state.storage.sql.exec(
        'SELECT room_id FROM admissions WHERE admission_id = ?',
        admissionId,
      )][0]
      const admissions = [...this.state.storage.sql.exec(
        'SELECT COUNT(*) AS count FROM admissions WHERE utc_day = ?',
        utcDay,
      )][0].count
      const activeRooms = [...this.state.storage.sql.exec(
        'SELECT COUNT(*) AS count FROM active_rooms',
      )][0].count
      const existingRoom = [...this.state.storage.sql.exec(
        'SELECT 1 AS present FROM active_rooms WHERE room_id = ?',
        roomId,
      )][0]
      const decision = admissionDecision({
        admissions,
        activeRooms,
        duplicateRoomId: duplicate?.room_id,
        roomExists: Boolean(existingRoom),
        roomId,
      })
      if (decision === 'mismatch') return unavailable('ADMISSION_ROOM_MISMATCH', 409)
      if (decision === 'duplicate') {
        return json({ admitted: true, duplicate: true, room_id: duplicate.room_id })
      }
      if (decision === 'capped') return unavailable('LIVE_JURY_CAP_REACHED', 429)
      this.state.storage.sql.exec(
        'INSERT INTO admissions (admission_id, utc_day, room_id) VALUES (?, ?, ?)',
        admissionId,
        utcDay,
        roomId,
      )
      this.state.storage.sql.exec(
        'INSERT OR IGNORE INTO active_rooms (room_id, opened_at) VALUES (?, ?)',
        roomId,
        Date.now(),
      )
      return json({ admitted: true })
    }
    if (request.method === 'DELETE' && pathname.startsWith('/internal/rooms/')) {
      const roomId = decodeOpaqueId(pathname.slice('/internal/rooms/'.length))
      if (!roomId) return unavailable('INVALID_ROOM_ID', 400)
      this.state.storage.sql.exec('DELETE FROM active_rooms WHERE room_id = ?', roomId)
      return new Response(null, { status: 204 })
    }
    return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 501)
  }
}

export class FairnessDO {
  constructor(state) {
    this.state = state
    state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS participant_fairness (
        participant_key TEXT PRIMARY KEY,
        waiting_since INTEGER,
        selection_count INTEGER NOT NULL DEFAULT 0,
        last_seated_at INTEGER
      );
    `)
  }

  async fetch() {
    return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 501)
  }
}

export class RoomDO {
  constructor(state, env) {
    this.state = state
    this.env = env
    state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_events (
        sequence INTEGER PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seat_usage (
        seat_id TEXT PRIMARY KEY,
        messages INTEGER NOT NULL DEFAULT 0 CHECK (messages >= 0)
      );
    `)
  }

  async fetch(request) {
    if (!liveJuryEnabled(this.env)) return unavailable()
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return unavailable('WEBSOCKET_REQUIRED', 426)
    }
    const seatId = parseSeatId(request.headers.get('X-SimJury-Verified-Seat'))
    if (!seatId) return unavailable('VERIFIED_SEAT_REQUIRED', 401)

    const pair = new WebSocketPair()
    this.state.storage.sql.exec(
      'INSERT OR IGNORE INTO seat_usage (seat_id, messages) VALUES (?, 0)',
      seatId,
    )
    this.state.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ acceptedAt: Date.now(), seatId })
    if (await this.state.storage.getAlarm() === null) {
      await this.state.storage.setAlarm(Date.now() + FREE_BETA_LIMITS.roomTtlSeconds * 1_000)
    }
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(socket, message) {
    const { seatId } = socket.deserializeAttachment() ?? {}
    if (!parseSeatId(seatId)) {
      socket.close(1008, 'Seat identity is missing')
      return
    }
    if (typeof message !== 'string' || message.length > FREE_BETA_LIMITS.messageCharacters) {
      socket.close(1009, 'Message exceeds the live-jury beta limit')
      return
    }
    const usage = [...this.state.storage.sql.exec(
      'SELECT messages FROM seat_usage WHERE seat_id = ?',
      seatId,
    )][0]?.messages ?? 0
    if (!seatMaySend(usage)) {
      socket.close(1008, 'Message limit reached')
      return
    }
    this.state.storage.sql.exec(
      'UPDATE seat_usage SET messages = messages + 1 WHERE seat_id = ?',
      seatId,
    )
    socket.send(JSON.stringify({ type: 'runtime_pending', solo_path: '/today/' }))
  }

  async webSocketClose() {}
  async webSocketError() {}

  async alarm() {
    for (const socket of this.state.getWebSockets()) {
      socket.close(1001, 'Live-jury room expired')
    }
    await this.state.storage.deleteAll()
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (!isLiveRoute(pathname)) return env.ASSETS.fetch(request)

    if (request.method === 'GET' && pathname === '/api/live/healthz') {
      return json({
        ok: true,
        live_jury_enabled: liveJuryEnabled(env),
        ready: false,
        limits: FREE_BETA_LIMITS,
      })
    }
    if (pathname === '/api/live/healthz') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
      })
    }

    if (!liveJuryEnabled(env)) return unavailable()
    return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 501)
  },
}
