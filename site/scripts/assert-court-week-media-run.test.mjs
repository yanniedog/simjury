import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCanonicalArtifacts, assertReviewedRun, SESSION_ARTIFACTS } from './assert-court-week-media-run.mjs'

const run = (overrides = {}) => ({
  id: 42,
  name: 'court-week-media',
  path: '.github/workflows/court-week-media.yml',
  event: 'workflow_dispatch',
  repository: { full_name: 'yanniedog/simjury' },
  head_repository: { full_name: 'yanniedog/simjury' },
  head_branch: 'main',
  head_sha: 'a'.repeat(40),
  status: 'completed',
  conclusion: 'success',
  ...overrides,
})

let nextArtifactId = 1
const artifact = (name, sourceRun = run()) => ({
  id: nextArtifactId++,
  name,
  expired: false,
  workflow_run: { id: sourceRun.id, head_branch: sourceRun.head_branch, head_sha: sourceRun.head_sha },
})

const inventory = (items) => [{ total_count: items.length, artifacts: items }]
const reviewArtifacts = (sourceRun = run()) => [
  artifact('court-week-audio-jobs', sourceRun),
  ...SESSION_ARTIFACTS.map((name) => artifact(name, sourceRun)),
  artifact('court-week-cw-0001-2026.08.03-r1', sourceRun),
]
const options = { repository: 'yanniedog/simjury', releaseTag: 'court-week-cw-0001-2026.08.03-r1', runId: '42' }

test('package accepts exactly one source and seven canonical session artifacts', () => {
  const items = reviewArtifacts().slice(0, 8)
  assert.deepEqual(assertCanonicalArtifacts(inventory(items)), { artifactCount: 8, requiredCount: 8 })
})

test('package rejects duplicate, missing and incomplete inventories', () => {
  const items = reviewArtifacts().slice(0, 8)
  assert.throws(() => assertCanonicalArtifacts(inventory([...items, items[4]])), /thursday=2/u)
  assert.throws(() => assertCanonicalArtifacts(inventory(items.filter((item) => !item.name.endsWith('sunday')))), /sunday=0/u)
  assert.throws(() => assertCanonicalArtifacts([{ total_count: 9, artifacts: items }]), /inventory is incomplete/u)
})

test('package rejects the triplicate Thursday shape observed in run 30831483078', () => {
  const sourceRun = run({ id: 30831483078 })
  const names = [
    'court-week-cw-0001-2026.08.03-r1',
    'court-week-cw-0001-2026.08.03-r1-art-readiness',
    'court-week-audio-cw-0001-sunday',
    'court-week-audio-cw-0001-friday',
    'court-week-audio-cw-0001-saturday',
    'court-week-audio-cw-0001-thursday',
    'court-week-audio-cw-0001-thursday',
    'court-week-audio-cw-0001-thursday',
    'court-week-audio-cw-0001-tuesday',
    'court-week-audio-cw-0001-monday',
    'court-week-audio-cw-0001-wednesday',
    'court-week-audio-jobs',
  ]
  assert.throws(
    () => assertCanonicalArtifacts(inventory(names.map((name) => artifact(name, sourceRun)))),
    /court-week-audio-cw-0001-thursday=3/u,
  )
})

test('publish accepts one complete artifact set from the expected successful main run', () => {
  assert.deepEqual(assertReviewedRun(run(), inventory(reviewArtifacts()), options), { artifactCount: 9, requiredCount: 9 })
})

test('publish rejects wrong run, workflow, ref and status', () => {
  assert.throws(() => assertReviewedRun(run({ id: 41 }), inventory(reviewArtifacts(run({ id: 41 }))), options), /run id/u)
  assert.throws(() => assertReviewedRun(run({ path: '.github/workflows/other.yml' }), inventory(reviewArtifacts()), options), /workflow/u)
  assert.throws(() => assertReviewedRun(run({ head_branch: 'feature' }), inventory(reviewArtifacts(run({ head_branch: 'feature' }))), options), /ref/u)
  assert.throws(() => assertReviewedRun(run({ status: 'in_progress', conclusion: null }), inventory(reviewArtifacts()), options), /status/u)
})

test('publish rejects duplicate, missing and cross-run artifacts', () => {
  const items = reviewArtifacts()
  assert.throws(() => assertReviewedRun(run(), inventory([...items, items[4]]), options), /thursday=2/u)
  assert.throws(() => assertReviewedRun(run(), inventory(items.filter((item) => item.name !== options.releaseTag)), options), /2026\.08\.03-r1=0/u)
  const wrong = [...items]
  wrong[3] = artifact(wrong[3].name, run({ id: 99 }))
  assert.throws(() => assertReviewedRun(run(), inventory(wrong), options), /wrong-run/u)
})
