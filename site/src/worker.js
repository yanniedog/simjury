import {
  FREE_BETA_LIMITS,
  isLiveRoute,
  liveJuryEnabled,
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
      const { admissionId, roomId } = await request.json()
      const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
      if (!validId(admissionId) || !validId(roomId)) {
        return unavailable('INVALID_ADMISSION', 400)
      }
      const utcDay = new Date().toISOString().slice(0, 10)
      this.state.storage.sql.exec('DELETE FROM admissions WHERE utc_day <> ?', utcDay)
      const duplicate = [...this.state.storage.sql.exec(
        'SELECT 1 AS present FROM admissions WHERE admission_id = ?',
        admissionId,
      )][0]
      if (duplicate) return json({ admitted: true, duplicate: true })
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
      if (admissions >= FREE_BETA_LIMITS.admissionsPerUtcDay
        || (!existingRoom && activeRooms >= FREE_BETA_LIMITS.concurrentRooms)) {
        return unavailable('LIVE_JURY_CAP_REACHED', 429)
      }
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
      const roomId = decodeURIComponent(pathname.slice('/internal/rooms/'.length))
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
    `)
  }

  async fetch(request) {
    if (!liveJuryEnabled(this.env)) return unavailable()
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return unavailable('WEBSOCKET_REQUIRED', 426)
    }

    const pair = new WebSocketPair()
    this.state.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ acceptedAt: Date.now(), messages: 0 })
    await this.state.storage.setAlarm(Date.now() + FREE_BETA_LIMITS.roomTtlSeconds * 1_000)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(socket, message) {
    const attachment = socket.deserializeAttachment() ?? { messages: 0 }
    if (typeof message !== 'string' || message.length > FREE_BETA_LIMITS.messageCharacters) {
      socket.close(1009, 'Message exceeds the live-jury beta limit')
      return
    }
    if (attachment.messages >= FREE_BETA_LIMITS.messagesPerSeat) {
      socket.close(1008, 'Message limit reached')
      return
    }
    socket.serializeAttachment({ ...attachment, messages: attachment.messages + 1 })
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

    if (!liveJuryEnabled(env)) return unavailable()
    return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 501)
  },
}
