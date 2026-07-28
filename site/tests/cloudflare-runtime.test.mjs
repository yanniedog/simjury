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
  parseDisplayName,
  parseSeatId,
  roomRoute,
  roomExpiryCutoff,
  seatMaySend,
} from '../src/live-policy.js'
import worker from '../src/worker.js'

const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'))
const expectedClasses = ['PoolCoordinatorDO', 'FairnessDO', 'RoomDO']

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
          return Response.json({ case_id: 'dd-0039', seats: [] })
        },
      }
    },
  }
  const response = await worker.fetch(
    new Request('https://simjury.com/api/live/rooms/example', {
      headers: { Authorization: `Bearer ${'a'.repeat(43)}` },
    }),
    { LIVE_JURY_ENABLED: 'true', ROOMS: rooms },
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
      body: JSON.stringify({ case_id: 'dd-0039' }),
    },
  ), env)
  const created = await createdResponse.json()
  assert.equal(createdResponse.status, 201)
  assert.equal(parseCapability(created.invite_token), created.invite_token)
  assert.equal(parseCapability(created.host_token), created.host_token)
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
  ), { LIVE_JURY_ENABLED: 'true' })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'INVALID_CASE')
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
  assert.equal(parseDisplayName('  Alex   K. '), 'Alex K.')
  assert.equal(parseDisplayName(`bad\u0000name`), null)
  assert.equal(parseDisplayName(`Alex\u202eK.`), null)
  assert.equal(parseDisplayName('x'.repeat(33)), null)
  assert.equal(roomRoute('/api/live/rooms/room_12'), 'room_12')
  assert.equal(roomRoute('/api/live/rooms/room%2Fescape'), null)
  assert.equal(roomRoute('/api/live/rooms/room_12/socket'), null)
  assert.equal(bearerCapability(new Request('https://simjury.com', {
    headers: { Authorization: `Bearer ${capability}` },
  })), capability)
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
    messageCharacters: 500,
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
  const invalidMethod = await worker.fetch(
    new Request('https://simjury.com/api/live/healthz', { method: 'POST' }),
    { LIVE_JURY_ENABLED: 'true' },
  )
  assert.equal(invalidMethod.status, 405)
  assert.equal(invalidMethod.headers.get('Allow'), 'GET')
})
