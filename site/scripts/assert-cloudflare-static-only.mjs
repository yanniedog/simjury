import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(siteRoot, 'wrangler.json'), 'utf8'))
const failures = []
const allowedTopLevel = new Set([
  '$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'preview_urls',
  'assets', 'durable_objects', 'migrations', 'vars', 'observability', 'd1_databases',
])
const allowedAssets = new Set([
  'directory', 'binding', 'run_worker_first', 'html_handling', 'not_found_handling',
])
// The complete list of paths that may reach the Worker. Ordinary and solo
// routes stay static; /api/waitlist is the single non-live exception, added
// under the amended allowlist in DAILY-PIVOT.md.
const expectedRoutes = ['/api/live/*', '/api/waitlist', '/discord/interactions']
const expectedD1 = [['WAITLIST', 'simjury-waitlist']]
const expectedBindings = [
  ['POOL_COORDINATOR', 'PoolCoordinatorDO'],
  ['FAIRNESS', 'FairnessDO'],
  ['ROOMS', 'RoomDO'],
]

if (config.main !== './src/worker.js') failures.push('Only the live-jury Worker main is allowed')
for (const key of Object.keys(config)) {
  if (!allowedTopLevel.has(key)) failures.push(`Cloudflare setting is not allowlisted: ${key}`)
}
for (const key of Object.keys(config.assets ?? {})) {
  if (!allowedAssets.has(key)) failures.push(`Assets setting is not allowlisted: ${key}`)
}
if (config.workers_dev !== false) failures.push('workers_dev must stay false')
if (config.preview_urls !== false) failures.push('preview_urls must stay false')
if (config.observability?.enabled !== false) failures.push('observability must stay disabled')
if (Object.keys(config.observability ?? {}).some((key) => key !== 'enabled')) {
  failures.push('Only the disabled observability flag is allowed')
}
if (config.assets?.directory !== './public') failures.push('static assets directory must stay ./public')
if (config.assets?.binding !== 'ASSETS') failures.push('assets binding must be ASSETS')
if (JSON.stringify(config.assets?.run_worker_first) !== JSON.stringify(expectedRoutes)) {
  failures.push(`Worker-first routes must be exactly: ${expectedRoutes.join(', ')}`)
}
if (JSON.stringify(Object.keys(config.vars ?? {})) !== '["LIVE_JURY_ENABLED"]'
  || !['true', 'false'].includes(config.vars?.LIVE_JURY_ENABLED)) {
  failures.push('LIVE_JURY_ENABLED must be the only plain-text Worker variable')
}
const actualBindings = (config.durable_objects?.bindings ?? [])
  .map(({ name, class_name: className, ...extra }) => {
    if (Object.keys(extra).length) failures.push(`Unexpected Durable Object fields on ${name}`)
    return [name, className]
  })
if (JSON.stringify(actualBindings) !== JSON.stringify(expectedBindings)) {
  failures.push('Durable Object bindings do not match the live-jury allowlist')
}
if (Object.keys(config.durable_objects ?? {}).some((key) => key !== 'bindings')) {
  failures.push('Only Durable Object bindings are allowed')
}
const migration = config.migrations?.[0]
if (config.migrations?.length !== 1 || migration?.tag !== 'live-jury-v1'
  || JSON.stringify(migration?.new_sqlite_classes) !== JSON.stringify(expectedBindings.map(([, value]) => value))
  || Object.keys(migration ?? {}).some((key) => !['tag', 'new_sqlite_classes'].includes(key))) {
  failures.push('Only the live-jury-v1 SQLite Durable Object migration is allowed')
}
// D1 holds the waitlist only. It is bounded the same way the Durable Objects
// are: an exact binding list, no extra fields, and no second database.
const D1_ID_PLACEHOLDER = 'REPLACE_WITH_D1_DATABASE_ID'
const pendingD1 = []
const actualD1 = (config.d1_databases ?? []).map(
  ({ binding, database_name: databaseName, database_id: databaseId, ...extra }) => {
    if (Object.keys(extra).length) failures.push(`Unexpected D1 fields on ${binding}`)
    if (!databaseId) failures.push(`D1 binding ${binding} needs a database_id`)
    // The placeholder is not a failure: the id only exists once the operator
    // runs `wrangler d1 create`, and CI must stay green before that. Shipping
    // with it still fails safely — an unbound WAITLIST returns 503 rather than
    // accepting signups into nothing. See docs/WAITLIST.md.
    else if (databaseId === D1_ID_PLACEHOLDER) pendingD1.push(binding)
    return [binding, databaseName]
  },
)
if (JSON.stringify(actualD1) !== JSON.stringify(expectedD1)) {
  failures.push('D1 bindings do not match the waitlist allowlist')
}
if (!existsSync(join(siteRoot, 'schema', 'waitlist.sql'))) {
  failures.push('schema/waitlist.sql is required so the D1 table is reproducible')
}
if (!existsSync(join(siteRoot, 'src', 'worker.js'))) failures.push('Worker source is required')
for (const file of ['_headers', '_redirects']) {
  if (!existsSync(join(siteRoot, 'public', file))) failures.push(`public/${file} is required`)
}

if (failures.length) {
  console.error(`Cloudflare live-runtime guard failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
for (const binding of pendingD1) {
  console.warn(`Note: ${binding} still holds the placeholder database_id — run the one-time setup in docs/WAITLIST.md before signups can be stored.`)
}
console.log('Cloudflare guard passed: static-first with only bounded live-jury routes, the waitlist route, SQLite Durable Objects and one D1 database.')
