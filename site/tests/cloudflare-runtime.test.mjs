import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  FREE_BETA_LIMITS,
  LIVE_ROUTE_PATTERNS,
  admissionDecision,
  bearerCapability,
  decodeOpaqueId,
  isLiveRoute,
  parseCapability,
  parseCaseId,
  parseDerivationRevision,
  parseDisplayName,
  parseLiveEvent,
  SITTING_STAGES,
  parseSeatId,
  roomRoute,
  roomSocketRoute,
  roomExpiryCutoff,
  seatMaySend,
  socketCredentialsFromProtocols,
} from '../src/live-policy.js'
import worker, { RoomDO } from '../src/worker.js'

const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'))
const expectedClasses = ['PoolCoordinatorDO', 'FairnessDO', 'RoomDO']
const REVISION = 'hybrid-v1-1234abcd'

test('only live endpoints execute the Worker', () => {
  assert.deepEqual(config.assets.run_worker_first, LIVE_ROUTE_PATTERNS)
  assert.equal(isLiveRoute('/api/live/healthz'), true)
  assert.equal(isLiveRoute('/discord/interactions'), true)
  for (const path of ['/', '/today/', '/privacy/', '/media/case.webp']) {
    assert.equal(isLiveRoute(path), false)
  }
})

test('configuration allowlists only the three SQLite Durable Objects', () => {
  assert.deepEqual(config.durable_objects.bindings.map(
    ({ name, class_name: className }) => [name, className],
  ), [
    ['POOL_COORDINATOR', 'PoolCoordinatorDO'],
    ['FAIRNESS', 'FairnessDO'],
    ['ROOMS', 'RoomDO'],
  ])
  assert.deepEqual(config.migrations[0].new_sqlite_classes, expectedClasses)
  for (const product of ['d1_databases', 'kv_namespaces', 'r2_buckets', 'queues', 'ai']) {
    assert.equal(product in config, false)
  }
})

test('non-live requests retain the static asset fallback', async () => {
  let forwarded = false
  const request = new Request('https://simjury.com/today/')
  const response = await worker.fetch(request, {
    LIVE_JURY_ENABLED: 'false',
    ASSETS: {
      fetch(received) {
        forwarded = received === request
        return new Response('static')
      },
    },
  })
  assert.equal(forwarded, true)
  assert.equal(await response.text(), 'static')
})

test('disabled live endpoints fail safely to solo play', async () => {
  const response = await worker.fetch(
    new Request('https://simjury.com/api/live/rooms/example'),
    { LIVE_JURY_ENABLED: 'false' },
  )
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal((await response.json()).solo_path, '/today/')
})

test('enabled live endpoints fail closed when a required binding is absent', async () => {
  const response = await worker.fetch(
    new Request('https://simjury.com/api/live/rooms/example'),
    { LIVE_JURY_ENABLED: 'true', ROOMS: {} },
  )
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'LIVE_JURY_PIPELINE_NOT_READY')
})

test('enabled room requests route only to the named room Durable Object', async () => {
  const calls = []
  const rooms = {
    idFromName(name) {
      calls.push(['id', name])
      return `id:${name}`
    },
    get(id) {
      calls.push(['get', id])
      return {
        async fetch(request) {
          calls.push(['fetch', new URL(request.url).pathname])
          return Response.json({
            case_id: 'dd-0039',
            derivation_revision: REVISION,
            seats: [],
          })
        },
      }
    },
  }
  const response = await worker.fetch(
    new Request('https://simjury.com/api/live/rooms/example', {
      headers: { Authorization: `Bearer ${'a'.repeat(43)}` },
    }),
    { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: rooms },
  )
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.case_id, 'dd-0039')
  assert.deepEqual(calls, [
    ['id', 'example'],
    ['get', 'id:example'],
    ['fetch', '/internal/status'],
  ])
})

test('room creation is admitted before allocation and host close releases capacity', async () => {
  const calls = []
  const namespace = (label, responder) => ({
    idFromName(name) {
      calls.push([label, 'id', name])
      return `${label}:${name}`
    },
    get(id) {
      calls.push([label, 'get', id])
      return {
        async fetch(request) {
          calls.push([label, request.method, new URL(request.url).pathname])
          return responder(request)
        },
      }
    },
  })
  const coordinator = namespace('pool', (request) =>
    new URL(request.url).pathname.startsWith('/internal/rooms/')
      ? new Response(null, { status: 204 })
      : Response.json({ admitted: true }))
  const rooms = namespace('room', (request) =>
    request.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json({ created: true }, { status: 201 }))
  const env = {
    LIVE_JURY_ENABLED: 'true',
    POOL_COORDINATOR: coordinator,
    ROOMS: rooms,
  }
  const createdResponse = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: 'dd-0039',
        derivation_revision: REVISION,
      }),
    },
  ), env)
  const created = await createdResponse.json()
  assert.equal(createdResponse.status, 201)
  assert.equal(parseCapability(created.invite_token), created.invite_token)
  assert.equal(parseCapability(created.host_token), created.host_token)
  assert.equal(created.derivation_revision, REVISION)
  assert.deepEqual(calls.slice(0, 6).map(([label, operation]) => [label, operation]), [
    ['pool', 'id'], ['pool', 'get'], ['pool', 'POST'],
    ['room', 'id'], ['room', 'get'], ['room', 'POST'],
  ])

  const closed = await worker.fetch(new Request(
    `https://simjury.com/api/live/rooms/${created.room_id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${created.host_token}` } },
  ), env)
  assert.equal(closed.status, 204)
  assert.equal(calls.at(-1)[2].startsWith('/internal/rooms/'), true)
})

test('live JSON request bodies are bounded before allocation', async () => {
  const response = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '3000' },
      body: JSON.stringify({ case_id: 'dd-0039' }),
    },
  ), { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: {} })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'INVALID_CASE')
})

test('legacy join requests fail before a room object is invoked', async () => {
  let roomCalls = 0
  const response = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms/room_12',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite_token: 'a'.repeat(43),
        participant_key: 'participant',
        display_name: 'Alex',
      }),
    },
  ), {
    LIVE_JURY_ENABLED: 'true',
    POOL_COORDINATOR: {},
    ROOMS: {
      idFromName: (value) => value,
      get: () => ({ fetch: () => { roomCalls++; return Response.json({}) } }),
    },
  })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'ROOM_REVISION_MISMATCH')
  assert.equal(roomCalls, 0)
})

test('opaque room and seat identifiers fail closed', () => {
  assert.equal(decodeOpaqueId('%E0'), null)
  assert.equal(decodeOpaqueId('room%2Fescape'), null)
  assert.equal(decodeOpaqueId('room_12'), 'room_12')
  assert.equal(parseSeatId('0'), null)
  assert.equal(parseSeatId('12'), '12')
  assert.equal(parseSeatId('13'), null)
})

test('room inputs and capability routes fail closed', () => {
  const capability = 'a'.repeat(43)
  assert.equal(parseCapability(capability), capability)
  assert.equal(parseCapability('short'), null)
  assert.equal(parseCaseId('dd-0039'), 'dd-0039')
  assert.equal(parseCaseId('C-001'), null)
  assert.equal(parseDerivationRevision(REVISION), REVISION)
  assert.equal(parseDerivationRevision('bad.revision'), null)
  assert.equal(parseDisplayName('  Alex   K. '), 'Alex K.')
  assert.equal(parseDisplayName(`bad\u0000name`), null)
  assert.equal(parseDisplayName(`Alex\u202eK.`), null)
  assert.equal(parseDisplayName('x'.repeat(33)), null)
  assert.equal(roomRoute('/api/live/rooms/room_12'), 'room_12')
  assert.equal(roomRoute('/api/live/rooms/room%2Fescape'), null)
  assert.equal(roomRoute('/api/live/rooms/room_12/socket'), null)
  assert.equal(roomSocketRoute('/api/live/rooms/room_12/socket'), 'room_12')
  assert.deepEqual(
    socketCredentialsFromProtocols(`simjury-v2, ${capability}, ${REVISION}`),
    { seatToken: capability, derivationRevision: REVISION },
  )
  assert.equal(socketCredentialsFromProtocols(`simjury-v1, ${capability}`), null)
  assert.equal(bearerCapability(new Request('https://simjury.com', {
    headers: { Authorization: `Bearer ${capability}` },
  })), capability)
})

test('human deliberation events have a small explicit protocol', () => {
  assert.deepEqual(parseLiveEvent(JSON.stringify({
    type: 'message',
    text: '  I still have a question.  ',
  })), { type: 'message', text: 'I still have a question.' })
  assert.deepEqual(parseLiveEvent(JSON.stringify({
    type: 'position',
    position: 'U',
    reason: 'The time is unclear.',
  })), { type: 'position', position: 'U', reason: 'The time is unclear.' })
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'position', position: 'maybe' })), null)
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'message', text: '' })), null)
  assert.equal(parseLiveEvent('x'.repeat(1_025)), null)
})

test('a juror can announce how far through the sitting they are', () => {
  for (const stage of SITTING_STAGES) {
    assert.deepEqual(
      parseLiveEvent(JSON.stringify({ type: 'stage', stage })),
      { type: 'stage', stage },
    )
  }
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'stage', stage: 'lunch' })), null)
  assert.equal(parseLiveEvent(JSON.stringify({ type: 'stage' })), null)
  // A stage carries nothing a juror wrote, so it cannot smuggle prose.
  assert.deepEqual(
    parseLiveEvent(JSON.stringify({ type: 'stage', stage: 'juryroom', text: 'x' })),
    { type: 'stage', stage: 'juryroom' },
  )
})

test('socket capabilities are verified at the public boundary and not put in the URL', async () => {
  const capability = 'b'.repeat(43)
  let internalRequest
  const rooms = {
    idFromName: (name) => name,
    get: () => ({
      fetch(request) {
        internalRequest = request
        return Response.json({ forwarded: true })
      },
    }),
  }
  const response = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms/room_12/socket',
    {
      headers: {
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `simjury-v2, ${capability}, ${REVISION}`,
      },
    },
  ), { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: rooms })
  assert.equal((await response.json()).forwarded, true)
  assert.equal(new URL(internalRequest.url).pathname, '/internal/connect')
  assert.equal(internalRequest.headers.get('X-SimJury-Seat-Token'), capability)
  assert.equal(internalRequest.headers.get('X-SimJury-Derivation-Revision'), REVISION)
  assert.equal(internalRequest.url.includes(capability), false)

  const rejected = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms/room_12/socket',
    { headers: { Upgrade: 'websocket' } },
  ), { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: rooms })
  assert.equal(rejected.status, 401)

  const misordered = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms/room_12/socket',
    {
      headers: {
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': `${capability}, simjury-v2, ${REVISION}`,
      },
    },
  ), { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: rooms })
  assert.equal(misordered.status, 401)

  const notWebSocket = await worker.fetch(new Request(
    'https://simjury.com/api/live/rooms/room_12/socket',
  ), { LIVE_JURY_ENABLED: 'true', POOL_COORDINATOR: {}, ROOMS: rooms })
  assert.equal(notWebSocket.status, 426)
  assert.equal((await notWebSocket.json()).code, 'WEBSOCKET_REQUIRED')
})

function fakeRoom() {
  const events = []
  const usage = new Map([['1', 0], ['2', 0]])
  // Per-seat stage bookkeeping, which bounds the message-budget exemption.
  const stages = new Map()
  const stageChanges = new Map()
  const sockets = []
  const sql = {
    exec(statement, ...bindings) {
      if (statement.includes('FROM seat_usage WHERE seat_id')) {
        const seat = String(bindings[0])
        return [{
          messages: usage.get(seat) ?? 0,
          stage: stages.get(seat) ?? null,
          stage_changes: stageChanges.get(seat) ?? 0,
        }]
      }
      if (statement.includes('UPDATE seat_usage SET messages')) {
        const seat = String(bindings[0])
        usage.set(seat, (usage.get(seat) ?? 0) + 1)
      }
      if (statement.includes('UPDATE seat_usage SET stage')) {
        const [stage, seat] = [bindings[0], String(bindings[1])]
        stages.set(seat, stage)
        stageChanges.set(seat, (stageChanges.get(seat) ?? 0) + 1)
      }
      if (statement.includes('INSERT INTO room_events')) events.push(bindings)
      if (statement.includes('last_insert_rowid')) return [{ sequence: events.length }]
      return []
    },
  }
  const state = {
    storage: { sql },
    getWebSockets: () => sockets.filter((socket) => !socket.closed),
  }
  return {
    events, room: new RoomDO(state, { LIVE_JURY_ENABLED: 'true' }), sockets, usage, stages, stageChanges,
  }
}

function fakeSocket(seatId) {
  return {
    closed: null,
    sent: [],
    close(code, reason) { this.closed = { code, reason } },
    deserializeAttachment: () => ({ displayName: `Juror ${seatId}`, seatId }),
    send(message) { this.sent.push(JSON.parse(message)) },
  }
}

test('legacy room metadata is migrated without assigning a silent revision', () => {
  const statements = []
  const state = {
    storage: {
      sql: {
        exec(statement) {
          statements.push(statement)
          return statement.startsWith('PRAGMA table_info')
            ? [{ name: 'case_id' }, { name: 'invite_hash' }]
            : []
        },
      },
    },
  }
  new RoomDO(state, { LIVE_JURY_ENABLED: 'true' })
  assert.equal(
    statements.includes('ALTER TABLE room_meta ADD COLUMN derivation_revision TEXT'),
    true,
  )
})

test('room messages meter invalid frames and enforce the lifetime seat cap', async () => {
  const { events, room, sockets, usage } = fakeRoom()
  const socket = fakeSocket('1')
  sockets.push(socket)
  await room.webSocketMessage(socket, '{"type":"unsupported"}')
  assert.deepEqual(socket.sent[0], { type: 'error', code: 'INVALID_EVENT' })
  assert.equal(usage.get('1'), 1)
  assert.equal(events.length, 0)
  for (let index = 1; index < FREE_BETA_LIMITS.messagesPerSeat; index++) {
    await room.webSocketMessage(socket, JSON.stringify({ type: 'message', text: `Point ${index}` }))
  }
  await room.webSocketMessage(socket, JSON.stringify({ type: 'message', text: 'one too many' }))
  assert.deepEqual(socket.closed, { code: 1008, reason: 'Message limit reached' })
  assert.equal(events.length, FREE_BETA_LIMITS.messagesPerSeat - 1)
})

test('room presence excludes a closed socket and duplicate seat sockets are superseded', () => {
  const { room, sockets } = fakeRoom()
  const first = fakeSocket('1')
  const second = fakeSocket('2')
  sockets.push(first, second)
  room.broadcastPresence()
  assert.deepEqual(second.sent.at(-1), { type: 'presence', connected_seats: [1, 2] })

  const duplicate = fakeSocket('1')
  sockets.push(duplicate)
  room.closeSeatSockets('1')
  assert.equal(first.closed.code, 4001)
  assert.equal(duplicate.closed.code, 4001)
  assert.equal(room.state.getWebSockets().map((socket) => socket.deserializeAttachment().seatId).join(','), '2')

  room.webSocketClose(first)
  assert.deepEqual(second.sent.at(-1), { type: 'presence', connected_seats: [2] })
})

test('admission caps and retries cannot create unregistered rooms', () => {
  const base = { admissions: 1, activeRooms: 1, roomExists: false, roomId: 'room_b' }
  assert.equal(admissionDecision({ ...base, duplicateRoomId: 'room_a' }), 'mismatch')
  assert.equal(admissionDecision({ ...base, roomId: 'room_a', duplicateRoomId: 'room_a' }), 'duplicate')
  assert.equal(admissionDecision({ ...base, admissions: 1_000 }), 'capped')
  assert.equal(admissionDecision({ ...base, activeRooms: 64 }), 'capped')
  assert.equal(admissionDecision({ ...base, activeRooms: 64, roomExists: true }), 'admit')
  assert.equal(roomExpiryCutoff(10_000_000), 2_800_000)
  assert.equal(seatMaySend(39), true)
  assert.equal(seatMaySend(40), false)
})

test('health exposes readiness and immutable free-beta limits', async () => {
  assert.deepEqual(FREE_BETA_LIMITS, {
    admissionsPerUtcDay: 1_000,
    concurrentRooms: 64,
    seatsPerRoom: 12,
    messagesPerSeat: 40,
    stageChangesPerSeat: 12,
    messageCharacters: 500,
    frameCharacters: 1_024,
    historyEvents: 120,
    displayNameCharacters: 32,
    roomTtlSeconds: 7_200,
  })
  const body = await (await worker.fetch(new Request(
    'https://simjury.com/api/live/healthz',
  ), { LIVE_JURY_ENABLED: 'false' })).json()
  assert.equal(body.ok, true)
  assert.equal(body.live_jury_enabled, false)
  assert.equal(body.ready, false)
  assert.deepEqual(body.limits, FREE_BETA_LIMITS)
  const enabledBody = await (await worker.fetch(new Request(
    'https://simjury.com/api/live/healthz',
  ), { LIVE_JURY_ENABLED: 'true' })).json()
  assert.equal(enabledBody.live_jury_enabled, true)
  assert.equal(enabledBody.ready, false)
  assert.deepEqual(enabledBody.limits, FREE_BETA_LIMITS)
  const readyBody = await (await worker.fetch(new Request(
    'https://simjury.com/api/live/healthz',
  ), {
    LIVE_JURY_ENABLED: 'true',
    POOL_COORDINATOR: {},
    ROOMS: {},
  })).json()
  assert.equal(readyBody.live_jury_enabled, true)
  assert.equal(readyBody.ready, true)
  const invalidMethod = await worker.fetch(
    new Request('https://simjury.com/api/live/healthz', { method: 'POST' }),
    { LIVE_JURY_ENABLED: 'true' },
  )
  assert.equal(invalidMethod.status, 405)
  assert.equal(invalidMethod.headers.get('Allow'), 'GET')
})

test('a stage ping is free, but only for a genuine change', async () => {
  const { events, room, sockets, usage } = fakeRoom()
  const socket = fakeSocket('1')
  sockets.push(socket)

  await room.webSocketMessage(socket, JSON.stringify({ type: 'stage', stage: 'juryroom' }))
  assert.equal(usage.get('1'), 0, 'moving through the sitting must not spend the message budget')
  assert.equal(events.length, 1)

  // Repeating the stage the seat is already on reaches nobody and costs nothing.
  for (let i = 0; i < 50; i += 1) {
    await room.webSocketMessage(socket, JSON.stringify({ type: 'stage', stage: 'juryroom' }))
  }
  assert.equal(events.length, 1, 'a no-op stage ping is dropped, not broadcast')
  assert.equal(usage.get('1'), 0)
  assert.equal(socket.closed, null)
})

test('free stage changes are bounded, so they cannot be farmed', async () => {
  // Every accepted frame stores an event and broadcasts to every peer, so an
  // unbounded exemption would be an amplification channel.
  const { events, room, sockets, usage } = fakeRoom()
  const socket = fakeSocket('1')
  sockets.push(socket)

  for (let i = 0; i < FREE_BETA_LIMITS.stageChangesPerSeat; i += 1) {
    await room.webSocketMessage(
      socket,
      JSON.stringify({ type: 'stage', stage: SITTING_STAGES[i % SITTING_STAGES.length] }),
    )
  }
  assert.equal(usage.get('1'), 0, 'the allowance itself is free')
  assert.equal(events.length, FREE_BETA_LIMITS.stageChangesPerSeat)

  // Past the allowance a stage change costs the ordinary budget like any frame.
  await room.webSocketMessage(socket, JSON.stringify({ type: 'stage', stage: SITTING_STAGES[0] }))
  assert.equal(usage.get('1'), 1)
})

test('a seat out of message budget cannot keep announcing stages', async () => {
  const { room, sockets, usage } = fakeRoom()
  const socket = fakeSocket('1')
  sockets.push(socket)
  usage.set('1', FREE_BETA_LIMITS.messagesPerSeat)

  for (let i = 0; i < FREE_BETA_LIMITS.stageChangesPerSeat; i += 1) {
    await room.webSocketMessage(
      socket,
      JSON.stringify({ type: 'stage', stage: SITTING_STAGES[i % SITTING_STAGES.length] }),
    )
  }
  await room.webSocketMessage(socket, JSON.stringify({ type: 'stage', stage: 'juryroom' }))
  assert.deepEqual(socket.closed, { code: 1008, reason: 'Message limit reached' })
})
