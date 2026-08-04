import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { canonicalSha256 } from './canonical-json.mjs'
import {
  assertPinnedMediaMatchesRelease,
  assertReleasePayloadMatchesManifest,
  assertReleasePayloadReadyForPublication,
} from './assert-pinned-media-release.mjs'

const releaseTag = 'court-week-cw-0001-2026.08.03-r1'
const revision = '2026.08.03-r1'

function assetName(label, extension) {
  return `${createHash('sha256').update(label).digest('hex')}${extension}`
}

const assetInputs = {
  opusA: ['opus-a', '.opus'],
  opusB: ['opus-b', '.opus'],
  aac: ['aac', '.m4a'],
  mp3: ['mp3', '.mp3'],
  captions: ['captions', '.vtt'],
  portraitAvif: ['portrait-avif', '.avif'],
  portraitWebp: ['portrait-webp', '.webp'],
  tabletAvif: ['tablet-avif', '.avif'],
  tabletWebp: ['tablet-webp', '.webp'],
  desktopAvif: ['desktop-avif', '.avif'],
  desktopWebp: ['desktop-webp', '.webp'],
}
const names = Object.fromEntries(Object.entries(assetInputs).map(([key, [label, extension]]) => [key, assetName(label, extension)]))
const payloadBytes = new Map(Object.entries(assetInputs).map(([key, [label]]) => [names[key], Buffer.from(label)]))

function matchedManifests() {
  const runtime = {
    schema: 'simjury.court-week-runtime-media/v1',
    case_id: 'cw-0001',
    release_tag: releaseTag,
    source_revision: revision,
    sessions: Array.from({ length: 7 }, (_, index) => ({
      session_id: `session-${index + 1}`,
      segments: [{ sources: { opus: index === 0 ? names.opusA : names.opusB, aac: names.aac, mp3: names.mp3, captions: names.captions } }],
      art: { strips: [{ sources: {
        portrait: { avif: names.portraitAvif, webp: names.portraitWebp },
        tablet: { avif: names.tabletAvif, webp: names.tabletWebp },
        desktop: { avif: names.desktopAvif, webp: names.desktopWebp },
      } }] },
    })),
  }
  const assets = [...new Set(Object.values(names))].map((name) => ({
    asset_name: name,
    bytes: payloadBytes.get(name).length,
    sha256: name.slice(0, 64),
  }))
  const release = {
    schema: 'simjury.court-week-media/v1',
    case_id: 'cw-0001',
    release_tag: releaseTag,
    court_week_revision: revision,
    review_content_digest: `sha256:${'a'.repeat(64)}`,
    art_readiness: { release_ready: true, crop_review_complete: true, scene_count: 55, ready_scene_count: 55, gap_count: 0 },
    asset_count: assets.length + 1,
    media_bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    assets,
  }
  release.runtime_manifest_digest = canonicalSha256(runtime)
  const reviewSignoffs = {
    schema: 'simjury.court-week-review-signoffs/v1',
    caseId: 'cw-0001',
    revision,
    contentDigest: release.review_content_digest,
    signoffs: [
      'prosecution', 'defence', 'judicial-neutrality', 'accessibility',
      'sensitivity', 'read-aloud', 'blind-balance', 'fixed-scope-criminal-law',
    ].map((role) => ({ role, decision: 'approved' })),
  }
  return { runtime, release, reviewSignoffs }
}

test('accepts matching identity and the exact content-addressed runtime asset set', () => {
  const { runtime, release, reviewSignoffs } = matchedManifests()
  assert.deepEqual(assertPinnedMediaMatchesRelease(runtime, release, reviewSignoffs, releaseTag), {
    caseId: 'cw-0001',
    revision,
    releaseTag,
    assetCount: 11,
  })
})

test('rejects a swapped same-format runtime mapping even when the asset set is unchanged', () => {
  const manifests = matchedManifests()
  const first = manifests.runtime.sessions[0].segments[0].sources
  const second = manifests.runtime.sessions[1].segments[0].sources
  const firstOpus = first.opus
  first.opus = second.opus
  second.opus = firstOpus
  assert.throws(
    () => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag),
    /runtime mapping digest mismatch/u,
  )
})

test('rejects stale case, revision and tag identities', async (t) => {
  for (const [name, mutate, expected] of [
    ['runtime schema', ({ runtime }) => { runtime.schema = 'stale-runtime/v1' }, /Unsupported pinned runtime media schema/u],
    ['release schema', ({ release }) => { release.schema = 'stale-release/v1' }, /Unsupported immutable Release schema/u],
    ['case', ({ release }) => { release.case_id = 'cw-stale' }, /case mismatch/u],
    ['revision', ({ release }) => { release.court_week_revision = 'stale-r1' }, /revision mismatch/u],
    ['runtime tag', ({ runtime }) => { runtime.release_tag = 'court-week-cw-0001-2026.08.03-r2' }, /Release tag mismatch/u],
    ['release tag', ({ release }) => { release.release_tag = 'court-week-cw-0001-2026.08.03-r2' }, /Release tag mismatch/u],
  ]) {
    await t.test(name, () => {
      const manifests = matchedManifests()
      mutate(manifests)
      assert.throws(() => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag), expected)
    })
  }
})

test('rejects stale reviewed-source identity and incomplete signoffs', async (t) => {
  await t.test('review revision mismatch', () => {
    const manifests = matchedManifests()
    manifests.reviewSignoffs.revision = 'stale-r1'
    assert.throws(
      () => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag),
      /review revision mismatch/u,
    )
  })
  await t.test('reviewed-source digest mismatch', () => {
    const manifests = matchedManifests()
    manifests.reviewSignoffs.contentDigest = `sha256:${'b'.repeat(64)}`
    assert.throws(
      () => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag),
      /reviewed-source digest mismatch/u,
    )
  })
  await t.test('pending required role', () => {
    const manifests = matchedManifests()
    manifests.reviewSignoffs.signoffs[3].decision = 'pending'
    assert.throws(
      () => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag),
      /requires all eight exact-source signoffs/u,
    )
  })
})

test('rejects an immutable Release without complete crop-reviewed art readiness', async (t) => {
  for (const [name, mutate] of [
    ['release_ready false', (readiness) => { readiness.release_ready = false }],
    ['crop review incomplete', (readiness) => { readiness.crop_review_complete = false }],
    ['scene count incomplete', (readiness) => { readiness.scene_count = 54 }],
    ['ready count incomplete', (readiness) => { readiness.ready_scene_count = 54 }],
    ['remaining gap', (readiness) => { readiness.gap_count = 1 }],
  ]) {
    await t.test(name, () => {
      const manifests = matchedManifests()
      mutate(manifests.release.art_readiness)
      assert.throws(
        () => assertPinnedMediaMatchesRelease(manifests.runtime, manifests.release, manifests.reviewSignoffs, releaseTag),
        /Release art is not ready/u,
      )
    })
  }
})

test('rejects missing, extra and SHA-mismatched Release assets', async (t) => {
  await t.test('missing runtime asset', () => {
    const { runtime, release, reviewSignoffs } = matchedManifests()
    const removed = release.assets.pop()
    release.asset_count = release.assets.length + 1
    release.media_bytes -= removed.bytes
    assert.throws(() => assertPinnedMediaMatchesRelease(runtime, release, reviewSignoffs, releaseTag), /missing from Release:/u)
  })
  await t.test('extra Release asset', () => {
    const { runtime, release, reviewSignoffs } = matchedManifests()
    const name = assetName('extra', '.webp')
    release.assets.push({ asset_name: name, bytes: 50, sha256: name.slice(0, 64) })
    release.asset_count += 1
    release.media_bytes += 50
    assert.throws(() => assertPinnedMediaMatchesRelease(runtime, release, reviewSignoffs, releaseTag), /extra in Release:/u)
  })
  await t.test('mismatched SHA-256 mapping', () => {
    const { runtime, release, reviewSignoffs } = matchedManifests()
    release.assets[0].sha256 = '0'.repeat(64)
    assert.throws(() => assertPinnedMediaMatchesRelease(runtime, release, reviewSignoffs, releaseTag), /does not match its declared SHA-256/u)
  })
})

function writeReleasePayload(release) {
  const directory = mkdtempSync(join(tmpdir(), 'simjury-release-payload-'))
  for (const asset of release.assets) writeFileSync(join(directory, asset.asset_name), payloadBytes.get(asset.asset_name))
  let manifestBytes = Buffer.from(`${JSON.stringify(release)}\n`)
  do {
    release.total_bytes = release.media_bytes + manifestBytes.length
    manifestBytes = Buffer.from(`${JSON.stringify(release)}\n`)
  } while (release.total_bytes !== release.media_bytes + manifestBytes.length)
  writeFileSync(join(directory, 'release-manifest.json'), manifestBytes)
  return directory
}

test('hashes the exact attached immutable Release payload', async (t) => {
  await t.test('matching payload', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    assert.doesNotThrow(() => assertReleasePayloadMatchesManifest(release, directory))
  })
  await t.test('missing attachment', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    rmSync(join(directory, release.assets[0].asset_name))
    assert.throws(() => assertReleasePayloadMatchesManifest(release, directory), /Attached Release inventory mismatch/u)
  })
  await t.test('extra attachment', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    writeFileSync(join(directory, 'unexpected.txt'), 'unexpected')
    assert.throws(() => assertReleasePayloadMatchesManifest(release, directory), /Attached Release inventory mismatch/u)
  })
  await t.test('corrupt attachment', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    writeFileSync(join(directory, release.assets[0].asset_name), 'corrupt')
    assert.throws(() => assertReleasePayloadMatchesManifest(release, directory), /failed integrity/u)
  })
})

test('publication re-verifies the complete reviewed payload immediately before release creation', async (t) => {
  await t.test('matching payload', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    assert.deepEqual(assertReleasePayloadReadyForPublication(release, directory, releaseTag), {
      assetCount: 11,
      releaseTag,
      totalBytes: release.total_bytes,
    })
  })
  await t.test('substituted asset', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    writeFileSync(join(directory, release.assets[0].asset_name), 'substituted')
    assert.throws(
      () => assertReleasePayloadReadyForPublication(release, directory, releaseTag),
      /failed integrity/u,
    )
  })
  await t.test('incomplete byte manifest', (t) => {
    const { release } = matchedManifests()
    const directory = writeReleasePayload(release)
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    release.total_bytes += 1
    assert.throws(
      () => assertReleasePayloadReadyForPublication(release, directory, releaseTag),
      /total_bytes/u,
    )
  })
})
