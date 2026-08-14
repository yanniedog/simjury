import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(siteRoot, 'wrangler.json'), 'utf8'))
const failures = []
const allowedTopLevel = new Set([
  '$schema', 'name', 'compatibility_date', 'workers_dev', 'preview_urls', 'assets',
])
const allowedAssets = new Set([
  'directory', 'html_handling', 'not_found_handling',
])
const forbiddenKeys = new Set([
  'main', 'routes', 'route', 'vars', 'observability', 'durable_objects',
  'migrations', 'd1_databases', 'kv_namespaces', 'r2_buckets', 'queues', 'ai',
  'ratelimits', 'analytics_engine_datasets', 'services', 'dispatch_namespaces',
  'mtls_certificates', 'pipelines', 'tail_consumers', 'placement', 'workflows',
  'unsafe', 'logpush', 'browser', 'vectorize', 'hyperdrive',
])

for (const key of Object.keys(config)) {
  if (!allowedTopLevel.has(key)) failures.push(`Cloudflare setting is not assets-only: ${key}`)
  if (forbiddenKeys.has(key)) failures.push(`Cloudflare runtime key is forbidden: ${key}`)
}
for (const key of Object.keys(config.assets ?? {})) {
  if (!allowedAssets.has(key)) failures.push(`Static asset setting is not allowlisted: ${key}`)
}
if (config.name !== 'simjury-web') failures.push('Cloudflare project name must remain simjury-web')
if (config.workers_dev !== false) failures.push('workers_dev must stay false')
if (config.preview_urls !== false) failures.push('preview_urls must stay false')
if (config.assets?.directory !== './public') failures.push('assets directory must stay ./public')
if (config.assets?.html_handling !== 'auto-trailing-slash') {
  failures.push('static HTML handling must remain auto-trailing-slash')
}
if (config.assets?.not_found_handling !== '404-page') {
  failures.push('unknown routes must keep a real 404 page')
}

for (const path of [
  join(siteRoot, 'src', 'worker.js'),
  join(siteRoot, 'src', 'live-policy.js'),
  join(siteRoot, 'schema', 'waitlist.sql'),
  join(siteRoot, 'public', 'waitlist.js'),
]) {
  if (existsSync(path)) failures.push(`Retired runtime surface must stay absent: ${path}`)
}

const redirects = readFileSync(join(siteRoot, 'public', '_redirects'), 'utf8')
for (const line of redirects.split(/\r?\n/u).map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#'))) {
  const [source] = line.split(/\s+/u)
  if (!source.startsWith('/')) {
    failures.push(`Static Assets _redirects source must be a path, not a scheme or hostname: ${source}`)
  }
}
for (const route of ['/today / 302', '/play / 302', '/install / 302']) {
  if (!redirects.includes(route)) failures.push(`Compatibility redirect missing: ${route}`)
}

if (failures.length) {
  console.error(`Cloudflare assets-only guard failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Cloudflare guard passed: Static Assets only; no runtime entrypoint, route, binding, database, state or observability.')
