import {
  FREE_BETA_LIMITS,
  admissionDecision,
  decodeOpaqueId,
  bearerCapability,
  isLiveRoute,
  liveJuryEnabled,
  parseCapability,
  parseCaseId,
  parseDerivationRevision,
  parseDisplayName,
  parseLiveEvent,
  parseOpaqueId,
  parseSeatId,
  roomRoute,
  roomSocketRoute,
  roomExpiryCutoff,
  socketCredentialsFromProtocols,
  seatMayAnnounceStage,
  seatMaySend,
  unavailable,
} from './live-policy.js'

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function randomCapability() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function bodyOf(request) {
  const contentLength = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(contentLength) && contentLength > 2_048) return null
  try {
    const text = await request.text()
    return text.length <= 2_048 ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function durableFetch(namespace, name, path, init) {
  const stub = namespace.get(namespace.idFromName(name))
  return stub.fetch(new Request(`https://durable.internal${path}`, init))
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
    state.storage.sql.exec('PRAGMA foreign_keys = ON')
    state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        case_id TEXT NOT NULL,
        derivation_revision TEXT,
        invite_hash TEXT NOT NULL,
        host_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'closed'))
      );
      CREATE TABLE IF NOT EXISTS room_seats (
        seat_id INTEGER PRIMARY KEY CHECK (seat_id BETWEEN 1 AND 12),
        participant_hash TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 32),
        token_hash TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_events (
        sequence INTEGER PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seat_usage (
        seat_id TEXT PRIMARY KEY,
        messages INTEGER NOT NULL DEFAULT 0 CHECK (messages >= 0),
        -- The stage this seat last announced. A ping repeating it is dropped,
        -- so a client looping on one stage costs nothing and reaches nobody.
        stage TEXT,
        -- How many genuine changes it has made. Bounds the budget exemption.
        stage_changes INTEGER NOT NULL DEFAULT 0 CHECK (stage_changes >= 0)
      );
    `)
    const metaColumns = [...state.storage.sql.exec('PRAGMA table_info(room_meta)')]
    if (!metaColumns.some(({ name }) => name === 'derivation_revision')) {
      state.storage.sql.exec('ALTER TABLE room_meta ADD COLUMN derivation_revision TEXT')
    }
    const usageColumns = [...state.storage.sql.exec('PRAGMA table_info(seat_usage)')]
    if (!usageColumns.some(({ name }) => name === 'stage')) {
      state.storage.sql.exec('ALTER TABLE seat_usage ADD COLUMN stage TEXT')
      state.storage.sql.exec(
        'ALTER TABLE seat_usage ADD COLUMN stage_changes INTEGER NOT NULL DEFAULT 0',
      )
    }
  }

  async fetch(request) {
    if (!liveJuryEnabled(this.env)) return unavailable()
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const { pathname } = new URL(request.url)
      if (pathname !== '/internal/connect') return unavailable('ROOM_ROUTE_NOT_FOUND', 404)
      const seatToken = parseCapability(request.headers.get('X-SimJury-Seat-Token'))
      const derivationRevision = parseDerivationRevision(
        request.headers.get('X-SimJury-Derivation-Revision'),
      )
      if (!seatToken || !derivationRevision) return unavailable('VERIFIED_SEAT_REQUIRED', 401)
      const meta = [...this.state.storage.sql.exec(
        `SELECT derivation_revision, expires_at FROM room_meta
          WHERE singleton = 1 AND status = 'open'`,
      )][0]
      if (!meta || meta.expires_at <= Date.now()) return unavailable('ROOM_NOT_FOUND', 404)
      if (meta.derivation_revision !== derivationRevision) {
        return unavailable('ROOM_REVISION_MISMATCH', 409)
      }
      const seat = [...this.state.storage.sql.exec(
        'SELECT seat_id, display_name FROM room_seats WHERE token_hash = ?',
        await digest(seatToken),
      )][0]
      if (!seat) return unavailable('VERIFIED_SEAT_REQUIRED', 401)
      this.closeSeatSockets(String(seat.seat_id))
      const pair = new WebSocketPair()
      this.state.storage.sql.exec(
        'INSERT OR IGNORE INTO seat_usage (seat_id, messages) VALUES (?, 0)',
        String(seat.seat_id),
      )
      this.state.storage.sql.exec(
        'UPDATE room_seats SET last_seen_at = ? WHERE seat_id = ?',
        Date.now(), seat.seat_id,
      )
      this.state.acceptWebSocket(pair[1])
      pair[1].serializeAttachment({
        acceptedAt: Date.now(),
        displayName: seat.display_name,
        seatId: String(seat.seat_id),
      })
      const history = [...this.state.storage.sql.exec(
        `SELECT sequence, event_type, payload, created_at
          FROM room_events ORDER BY sequence DESC LIMIT ?`,
        FREE_BETA_LIMITS.historyEvents,
      )].reverse().map((event) => ({
        sequence: event.sequence,
        type: 'event',
        event_type: event.event_type,
        ...JSON.parse(event.payload),
        created_at: event.created_at,
      }))
      pair[1].send(JSON.stringify({
        type: 'welcome',
        seat_id: seat.seat_id,
        display_name: seat.display_name,
        history,
      }))
      this.broadcastPresence()
      return new Response(null, {
        status: 101,
        webSocket: pair[0],
        headers: { 'Sec-WebSocket-Protocol': 'simjury-v2' },
      })
    } else {
      const { pathname } = new URL(request.url)
      const body = request.method === 'POST' ? await bodyOf(request) : null
      if (request.method === 'POST' && !body) return unavailable('INVALID_JSON', 400)
      if (request.method === 'POST' && pathname === '/internal/create') {
        const caseId = parseCaseId(body.caseId)
        const inviteToken = parseCapability(body.inviteToken)
        const hostToken = parseCapability(body.hostToken)
        const derivationRevision = parseDerivationRevision(body.derivationRevision)
        if (!caseId || !inviteToken || !hostToken || !derivationRevision) {
          return unavailable('INVALID_ROOM', 400)
        }
        const existing = [...this.state.storage.sql.exec(
          'SELECT case_id, derivation_revision FROM room_meta WHERE singleton = 1',
        )][0]
        if (existing) {
          return existing.case_id === caseId
            && existing.derivation_revision === derivationRevision
            ? json({ created: true, duplicate: true, case_id: existing.case_id })
            : unavailable('ROOM_ID_CONFLICT', 409)
        }
        const now = Date.now()
        this.state.storage.sql.exec(
          `INSERT INTO room_meta
            (singleton, case_id, derivation_revision, invite_hash, host_hash,
              created_at, expires_at, status)
            VALUES (1, ?, ?, ?, ?, ?, ?, 'open')`,
          caseId,
          derivationRevision,
          await digest(inviteToken),
          await digest(hostToken),
          now,
          now + FREE_BETA_LIMITS.roomTtlSeconds * 1_000,
        )
        await this.state.storage.setAlarm(now + FREE_BETA_LIMITS.roomTtlSeconds * 1_000)
        return json({ created: true }, 201)
      }
      const meta = [...this.state.storage.sql.exec(
        `SELECT case_id, derivation_revision, invite_hash, host_hash, expires_at, status
          FROM room_meta WHERE singleton = 1`,
      )][0]
      if (!meta || meta.status !== 'open' || meta.expires_at <= Date.now()) {
        return unavailable('ROOM_NOT_FOUND', 404)
      }
      if (request.method === 'POST' && pathname === '/internal/join') {
        const inviteToken = parseCapability(body.inviteToken)
        const participantKey = parseOpaqueId(body.participantKey)
        const displayName = parseDisplayName(body.displayName)
        const derivationRevision = parseDerivationRevision(body.derivationRevision)
        if (!inviteToken || !participantKey || !displayName
          || derivationRevision !== meta.derivation_revision
          || await digest(inviteToken) !== meta.invite_hash) {
          return unavailable('ROOM_NOT_FOUND', 404)
        }
        const participantHash = await digest(participantKey)
        const prior = [...this.state.storage.sql.exec(
          'SELECT seat_id FROM room_seats WHERE participant_hash = ?',
          participantHash,
        )][0]
        const used = new Set([...this.state.storage.sql.exec(
          'SELECT seat_id FROM room_seats ORDER BY seat_id',
        )].map(({ seat_id: seatId }) => seatId))
        const seatId = prior?.seat_id
          ?? Array.from({ length: FREE_BETA_LIMITS.seatsPerRoom }, (_, index) => index + 1)
            .find((candidate) => !used.has(candidate))
        if (!seatId) return unavailable('ROOM_FULL', 409)
        if (prior) {
          this.closeSeatSockets(String(seatId))
        }
        const seatToken = randomCapability()
        this.state.storage.sql.exec(
          `INSERT INTO room_seats
            (seat_id, participant_hash, display_name, token_hash, joined_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(participant_hash) DO UPDATE SET
              display_name = excluded.display_name,
              token_hash = excluded.token_hash,
              last_seen_at = excluded.last_seen_at`,
          seatId, participantHash, displayName, await digest(seatToken),
          Date.now(), Date.now(),
        )
        return json({
          room_id: body.roomId,
          case_id: meta.case_id,
          derivation_revision: meta.derivation_revision,
          seat_id: seatId,
          seat_token: seatToken,
        })
      }
      const inviteToken = parseCapability(request.headers.get('X-SimJury-Invite'))
      if (request.method === 'GET' && pathname === '/internal/status') {
        if (!inviteToken || await digest(inviteToken) !== meta.invite_hash) {
          return unavailable('ROOM_NOT_FOUND', 404)
        }
        const seats = [...this.state.storage.sql.exec(
          'SELECT seat_id, display_name FROM room_seats ORDER BY seat_id',
        )]
        return json({
          case_id: meta.case_id,
          derivation_revision: meta.derivation_revision,
          seats,
          capacity: FREE_BETA_LIMITS.seatsPerRoom,
        })
      }
      const hostToken = parseCapability(request.headers.get('X-SimJury-Host'))
      if (request.method === 'DELETE' && pathname === '/internal/close') {
        if (!hostToken || await digest(hostToken) !== meta.host_hash) {
          return unavailable('ROOM_NOT_FOUND', 404)
        }
        this.state.storage.sql.exec("UPDATE room_meta SET status = 'closed' WHERE singleton = 1")
        for (const socket of this.state.getWebSockets()) socket.close(1001, 'Host closed the room')
        return new Response(null, { status: 204 })
      }
      return unavailable('ROOM_ROUTE_NOT_FOUND', 404)
    }
  }

  async webSocketMessage(socket, message) {
    const { displayName, seatId } = socket.deserializeAttachment() ?? {}
    if (!parseSeatId(seatId)) {
      socket.close(1008, 'Seat identity is missing')
      return
    }
    if (typeof message !== 'string' || message.length > FREE_BETA_LIMITS.frameCharacters) {
      socket.close(1009, 'Message exceeds the live-jury beta limit')
      return
    }
    const event = parseLiveEvent(message)
    const usageRow = [...this.state.storage.sql.exec(
      'SELECT messages, stage, stage_changes FROM seat_usage WHERE seat_id = ?',
      seatId,
    )][0]

    // Stage announcements are automatic progress pings rather than jury-room
    // contributions, so they must not consume a seat's message budget — moving
    // through the sitting would otherwise exhaust it.
    //
    // That exemption has to be bounded, or it is a free amplification channel:
    // every accepted frame stores an event and broadcasts to every peer. Two
    // bounds apply. A ping that repeats the stage the seat is already on is
    // dropped outright, so a client looping on one stage costs nothing and
    // reaches nobody. Genuine changes are free only up to a small allowance;
    // past that a seat pays the ordinary message budget like any other frame.
    let freeStageChange = false
    if (event?.type === 'stage') {
      if (usageRow?.stage === event.stage) return
      freeStageChange = seatMayAnnounceStage(usageRow?.stage_changes ?? 0)
    }

    if (!freeStageChange) {
      if (!seatMaySend(usageRow?.messages ?? 0)) {
        socket.close(1008, 'Message limit reached')
        return
      }
      this.state.storage.sql.exec(
        'UPDATE seat_usage SET messages = messages + 1 WHERE seat_id = ?',
        seatId,
      )
    }
    if (event?.type === 'stage') {
      this.state.storage.sql.exec(
        'UPDATE seat_usage SET stage = ?, stage_changes = stage_changes + 1 WHERE seat_id = ?',
        event.stage, seatId,
      )
    }
    if (!event) {
      socket.send(JSON.stringify({ type: 'error', code: 'INVALID_EVENT' }))
      return
    }
    const { type: eventType, ...eventData } = event
    const payload = JSON.stringify({
      seat_id: Number(seatId),
      display_name: displayName,
      ...eventData,
    })
    this.state.storage.sql.exec(
      'INSERT INTO room_events (event_type, payload, created_at) VALUES (?, ?, ?)',
      eventType, payload, Date.now(),
    )
    const sequence = [...this.state.storage.sql.exec(
      'SELECT last_insert_rowid() AS sequence',
    )][0].sequence
    const outbound = JSON.stringify({
      type: 'event',
      event_type: eventType,
      sequence,
      ...JSON.parse(payload),
    })
    for (const peer of this.state.getWebSockets()) peer.send(outbound)
  }

  broadcastPresence(exclude) {
    const seats = this.state.getWebSockets()
      .filter((socket) => socket !== exclude)
      .map((socket) => Number(socket.deserializeAttachment()?.seatId))
      .filter((seatId) => Number.isInteger(seatId))
      .sort((a, b) => a - b)
    const message = JSON.stringify({ type: 'presence', connected_seats: [...new Set(seats)] })
    for (const socket of this.state.getWebSockets()) {
      if (socket !== exclude) socket.send(message)
    }
  }

  closeSeatSockets(seatId) {
    for (const socket of this.state.getWebSockets()) {
      if (socket.deserializeAttachment()?.seatId === seatId) {
        socket.close(4001, 'Seat reconnected')
      }
    }
  }

  async webSocketClose(socket) {
    this.broadcastPresence(socket)
  }
  async webSocketError(socket) {
    this.broadcastPresence(socket)
  }

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
    const enabled = liveJuryEnabled(env)
    const ready = enabled && Boolean(env.POOL_COORDINATOR) && Boolean(env.ROOMS)

    if (request.method === 'GET' && pathname === '/api/live/healthz') {
      return json({
        ok: true,
        live_jury_enabled: enabled,
        ready,
        limits: FREE_BETA_LIMITS,
      })
    }
    if (pathname === '/api/live/healthz') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
      })
    }

    if (!enabled) return unavailable()
    if (!ready) return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 503)
    const socketRoomId = roomSocketRoute(pathname)
    if (socketRoomId) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return unavailable('WEBSOCKET_REQUIRED', 426)
      }
      const credentials = socketCredentialsFromProtocols(
        request.headers.get('Sec-WebSocket-Protocol'),
      )
      if (!credentials) return unavailable('VERIFIED_SEAT_REQUIRED', 401)
      return durableFetch(env.ROOMS, socketRoomId, '/internal/connect', {
        headers: {
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': 'simjury-v2',
          'X-SimJury-Seat-Token': credentials.seatToken,
          'X-SimJury-Derivation-Revision': credentials.derivationRevision,
        },
      })
    }
    if (request.method === 'POST' && pathname === '/api/live/rooms') {
      const body = await bodyOf(request)
      const caseId = parseCaseId(body?.case_id)
      const derivationRevision = parseDerivationRevision(body?.derivation_revision)
      if (!caseId || !derivationRevision) return unavailable('INVALID_CASE', 400)
      const roomId = crypto.randomUUID().replaceAll('-', '')
      const inviteToken = randomCapability()
      const hostToken = randomCapability()
      const admission = await durableFetch(
        env.POOL_COORDINATOR,
        'global',
        '/internal/admit',
        {
          method: 'POST',
          body: JSON.stringify({ admissionId: randomCapability(), roomId }),
        },
      )
      if (!admission.ok) return admission
      const created = await durableFetch(env.ROOMS, roomId, '/internal/create', {
        method: 'POST',
        body: JSON.stringify({ caseId, derivationRevision, inviteToken, hostToken }),
      })
      if (!created.ok) {
        await durableFetch(env.POOL_COORDINATOR, 'global', `/internal/rooms/${roomId}`, {
          method: 'DELETE',
        })
        return created
      }
      return json({
        room_id: roomId,
        case_id: caseId,
        derivation_revision: derivationRevision,
        invite_token: inviteToken,
        host_token: hostToken,
        expires_in: FREE_BETA_LIMITS.roomTtlSeconds,
      }, 201)
    }
    const roomId = roomRoute(pathname)
    if (roomId && request.method === 'POST') {
      const body = await bodyOf(request)
      if (!body) return unavailable('INVALID_JSON', 400)
      const derivationRevision = parseDerivationRevision(body.derivation_revision)
      if (!derivationRevision) return unavailable('ROOM_REVISION_MISMATCH', 409)
      return durableFetch(env.ROOMS, roomId, '/internal/join', {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          inviteToken: body.invite_token,
          participantKey: body.participant_key,
          displayName: body.display_name,
          derivationRevision,
        }),
      })
    }
    if (roomId && request.method === 'GET') {
      return durableFetch(env.ROOMS, roomId, '/internal/status', {
        headers: { 'X-SimJury-Invite': bearerCapability(request) ?? '' },
      })
    }
    if (roomId && request.method === 'DELETE') {
      const closed = await durableFetch(env.ROOMS, roomId, '/internal/close', {
        method: 'DELETE',
        headers: { 'X-SimJury-Host': bearerCapability(request) ?? '' },
      })
      if (closed.ok) {
        await durableFetch(env.POOL_COORDINATOR, 'global', `/internal/rooms/${roomId}`, {
          method: 'DELETE',
        })
      }
      return closed
    }
    return unavailable('LIVE_JURY_PIPELINE_NOT_READY', 501)
  },
}
