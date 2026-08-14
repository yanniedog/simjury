import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'))
const decisions = readFileSync(new URL('../DECISIONS.md', import.meta.url), 'utf8')
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

test('site deployment is gated by the full Court Week browser suite', () => {
  const workflowUrl = new URL('../../.github/workflows/site.yml', import.meta.url)
  const workflow = readFileSync(workflowUrl, 'utf8').replaceAll('\r\n', '\n')
  assert.equal(existsSync(new URL('../../.github/workflows/site-app-ci.yml', import.meta.url)), false)
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u)
  const app = workflow.slice(workflow.indexOf('\n  app:\n'), workflow.indexOf('\n  deploy:\n'))
  assert.match(app, /^\n  app:\n    name: site-app-check\n/u)
  assert.match(app, /run: npm run test:browser/u)
  assert.match(app, /run: npm run test:performance/u)
  assert.match(workflow, /\n  deploy:\n    name: site-deploy\n    needs: \[check, app\]\n/u)
})

test('legacy product paths redirect to the canonical Court Week route', () => {
  const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  assert.match(redirects, /^\/ \/jury\/court-week 200$/m)
  for (const path of ['/jury', '/jury/']) {
    assert.match(redirects, new RegExp(`^${path.replaceAll('/', '\\/')} \\/ 301$`, 'm'))
  }
  for (const path of ['/today', '/play', '/install']) {
    assert.match(redirects, new RegExp(`^${path.replace('/', '\\/')} \\/ 302$`, 'm'))
    assert.match(redirects, new RegExp(`^${path.replace('/', '\\/')}\\/\\* \\/ 302$`, 'm'))
  }
})

test('Static Assets redirects remain path-only', () => {
  const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8')
  const rules = redirects.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  assert.ok(rules.length > 0)
  for (const rule of rules) {
    const [source] = rule.split(/\s+/u)
    assert.match(source, /^\//u, `domain-level source is unsupported in Static Assets _redirects: ${source}`)
  }
})

test('canonical-origin zone redirect contract preserves paths and queries', () => {
  assert.match(
    decisions,
    /\(http\.host eq "www\.simjury\.com"\) or \(http\.host eq "simjury\.com" and not ssl\)/u,
  )
  assert.match(decisions, /concat\("https:\/\/simjury\.com", http\.request\.uri\.path\)/u)
  assert.match(decisions, /preserve the query\s+string/u)

  const canonicalRedirect = (input) => {
    const request = new URL(input)
    const alternateHost = request.hostname === 'www.simjury.com'
    const insecureApex = request.hostname === 'simjury.com' && request.protocol === 'http:'
    return alternateHost || insecureApex
      ? `https://simjury.com${request.pathname}${request.search}`
      : null
  }
  for (const [input, expected] of [
    ['http://simjury.com/', 'https://simjury.com/'],
    ['http://simjury.com/privacy/?from=audit&case=1', 'https://simjury.com/privacy/?from=audit&case=1'],
    ['https://www.simjury.com/jury/session/?day=2', 'https://simjury.com/jury/session/?day=2'],
    ['http://www.simjury.com/install?source=old', 'https://simjury.com/install?source=old'],
  ]) assert.equal(canonicalRedirect(input), expected)
  assert.equal(canonicalRedirect('https://simjury.com/privacy/?from=canonical'), null)
})

test('Court Week media publishing is trusted, manual and non-clobbering', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/court-week-media.yml', import.meta.url), 'utf8')
  const packager = readFileSync(new URL('../scripts/prepare-court-week-release.mjs', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /inputs\.publish != true/)
  assert.match(workflow, /reviewed_run_id/)
  assert.match(workflow, /gh run download/)
  assert.match(workflow, /review:signoffs -- --report/)
  assert.match(workflow, /--require-approved/)
  assert.match(workflow, /--expected-digest/)
  assert.match(workflow, /--expected-revision/)
  assert.match(workflow, /assert-pinned-media-release\.mjs/)
  assert.match(workflow, /--release-payload-only/)
  assert.match(workflow, /--release-assets-dir \.court-week-release/)
  assert.match(workflow, /--expected-release-tag "\$RELEASE_TAG"/)
  assert.match(packager, /scene_count: artReadiness\.scene_count/)
  assert.match(packager, /crop_review_complete: artReadiness\.crop_review_complete/)
  assert.match(packager, /runtime_manifest_digest: runtimeManifestDigest/)
  assert.match(workflow, /manifest\.runtime_manifest_digest/)
  assert.match(workflow, /Number\.isInteger\(readiness\?\.scene_count\)/)
  assert.match(workflow, /readiness\?\.release_ready !== true/)
  assert.match(workflow, /readiness\?\.crop_review_complete !== true/)
  assert.match(workflow, /readiness\.ready_scene_count !== readiness\.scene_count/)
  assert.match(workflow, /readiness\.gap_count !== 0/)
  assert.match(workflow, /release_ready=\$\{readiness\?\.release_ready/)
  assert.match(workflow, /crop_review_complete=\$\{readiness\?\.crop_review_complete/)
  assert.match(workflow, /ready_scene_count=\$\{readiness\?\.ready_scene_count/)
  assert.match(workflow, /scene_count=\$\{readiness\?\.scene_count/)
  assert.match(workflow, /gap_count=\$\{readiness\?\.gap_count/)
  assert.match(
    workflow,
    /--require-release-ready-art/,
    'authoritative review packaging must fail before upload when art is incomplete',
  )
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
  assert.match(workflow, /RELEASE_TAG: court-week-cw-0001-2026\.08\.03-r3/)
  assert.match(workflow, /isDraft == false and \.isImmutable == true/)
  assert.match(workflow, /assert-pinned-media-release\.mjs/)
  assert.match(workflow, /--runtime-manifest site\/app\/media\/court-week-media-manifest\.pinned\.json/)
  assert.match(workflow, /--release-manifest "\$RUNNER_TEMP\/court-week-release\/release-manifest\.json"/)
  assert.match(workflow, /--review-signoffs site\/app\/content-reviews\/cw-0001\.review-signoffs\.json/)
  assert.match(workflow, /--release-assets-dir "\$RUNNER_TEMP\/court-week-release"/)
  assert.match(workflow, /--expected-release-tag "\$RELEASE_TAG"/)
  assert.match(workflow, /COURT_WEEK_REQUIRE_PINNED_MEDIA: "1"/)
  const deploy = workflow.slice(workflow.indexOf('  deploy:'))
  const verifier = deploy.indexOf('node site/scripts/assert-pinned-media-release.mjs')
  const sourceReview = deploy.indexOf('Recompute and require exact deployed-source signoffs')
  const cloudflare = deploy.indexOf('Deploy static assets to Cloudflare')
  assert.ok(verifier >= 0 && verifier < deploy.indexOf('Install exact-source review verifier'))
  assert.ok(sourceReview > verifier && sourceReview < cloudflare)
  assert.ok(cloudflare > verifier)
})
