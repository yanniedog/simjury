import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(siteRoot, 'wrangler.json'), 'utf8'))
const forbiddenBindings = [
  'ai',
  'analytics_engine_datasets',
  'browser',
  'd1_databases',
  'dispatch_namespaces',
  'durable_objects',
  'hyperdrive',
  'kv_namespaces',
  'logfwdr',
  'logpush',
  'pipelines',
  'queues',
  'r2_buckets',
  'ratelimits',
  'send_email',
  'services',
  'tail_consumers',
  'vectorize',
  'workflows',
]
const failures = []

if ('main' in config) failures.push('Worker main script is forbidden')
for (const key of forbiddenBindings) {
  if (key in config) failures.push(`Cloudflare binding is forbidden: ${key}`)
}
if (config.workers_dev !== false) failures.push('workers_dev must stay false')
if (config.preview_urls !== false) failures.push('preview_urls must stay false')
if (config.observability?.enabled !== false) failures.push('observability must stay disabled')
if (!config.assets?.directory) failures.push('static assets directory is required')
if ('binding' in (config.assets ?? {})) failures.push('assets binding is forbidden')
if ('run_worker_first' in (config.assets ?? {})) failures.push('run_worker_first is forbidden')
if (existsSync(join(siteRoot, 'src', 'index.js'))) failures.push('Worker source must not exist')
for (const file of ['_headers', '_redirects']) {
  if (!existsSync(join(siteRoot, 'public', file))) failures.push(`public/${file} is required`)
}

if (failures.length) {
  console.error(`Cloudflare static-only guard failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Cloudflare static-only guard passed: assets only; no compute, AI, storage, previews, or logs.')
