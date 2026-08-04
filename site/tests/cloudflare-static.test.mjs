import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'))
const forbidden = [
  'main', 'route', 'routes', 'vars', 'observability', 'durable_objects',
  'migrations', 'd1_databases', 'kv_namespaces', 'r2_buckets', 'queues', 'ai',
  'ratelimits', 'services', 'analytics_engine_datasets', 'tail_consumers',
]

test('Cloudflare configuration is assets-only', () => {
  assert.deepEqual(config.assets, {
    directory: './public',
    html_handling: 'auto-trailing-slash',
    not_found_handling: '404-page',
  })
  assert.equal(config.workers_dev, false)
  assert.equal(config.preview_urls, false)
  for (const key of forbidden) assert.equal(key in config, false, `${key} must stay absent`)
})

test('retired runtime implementation remains absent', () => {
  for (const path of [
    '../src/worker.js',
    '../src/live-policy.js',
    '../schema/waitlist.sql',
    '../public/waitlist.js',
    '../../.github/workflows/docket-supply.yml',
    '../../.github/workflows/d1-maintenance.yml',
    '../../.github/workflows/natural-narration.yml',
    '../../.github/workflows/scylla-narration.yml',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} must stay retired`)
  }
})

test('legacy product paths redirect to the canonical Court Week route', () => {
  const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  for (const path of ['/today', '/play', '/install']) {
    assert.match(redirects, new RegExp(`^${path.replace('/', '\\/')} \\/jury\\/ 302$`, 'm'))
    assert.match(redirects, new RegExp(`^${path.replace('/', '\\/')}\\/\\* \\/jury\\/ 302$`, 'm'))
  }
})

test('Court Week media publishing is trusted, manual and non-clobbering', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/court-week-media.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /inputs\.publish != true/)
  assert.match(workflow, /reviewed_run_id/)
  assert.match(workflow, /gh run download/)
  assert.match(workflow, /Release .* already exists; immutable releases are never clobbered/)
  assert.match(workflow, /--json isImmutable/)
  assert.equal(
    (workflow.match(/include-hidden-files: true/g) ?? []).length,
    5,
    'every dot-prefixed media artifact upload must include hidden files',
  )
  assert.match(workflow, /ffmpeg -version/)
  assert.match(workflow, /import espeakng_loader/)
  assert.match(workflow, /Dir::Etc::sourcelist=\$ubuntu_sources/)
  assert.match(workflow, /Dir::Etc::sourceparts=-/)
  assert.doesNotMatch(workflow, /packages\.microsoft\.com/)
  assert.doesNotMatch(workflow, /pull_request_target:|\bschedule:/)
  assert.doesNotMatch(workflow, /--clobber/)
})

test('production deploy requires the exact pinned immutable release', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/site.yml', import.meta.url), 'utf8')
  assert.match(workflow, /RELEASE_TAG: court-week-cw-0001-2026\.08\.03-r1/)
  assert.match(workflow, /isDraft == false and \.isImmutable == true/)
  assert.match(workflow, /m\.release_tag!==process\.env\.RELEASE_TAG/)
  assert.match(workflow, /COURT_WEEK_REQUIRE_PINNED_MEDIA: "1"/)
})
