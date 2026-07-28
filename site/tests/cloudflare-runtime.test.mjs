import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  FREE_BETA_LIMITS,
  LIVE_ROUTE_PATTERNS,
  isLiveRoute,
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

test('health exposes readiness and immutable free-beta limits', async () => {
  assert.deepEqual(FREE_BETA_LIMITS, {
    admissionsPerUtcDay: 1_000,
    concurrentRooms: 64,
    messagesPerSeat: 40,
    messageCharacters: 500,
    roomTtlSeconds: 7_200,
  })
  const body = await (await worker.fetch(new Request(
    'https://simjury.com/api/live/healthz',
  ), { LIVE_JURY_ENABLED: 'false' })).json()
  assert.equal(body.ok, true)
  assert.equal(body.live_jury_enabled, false)
  assert.equal(body.ready, false)
  assert.deepEqual(body.limits, FREE_BETA_LIMITS)
})
