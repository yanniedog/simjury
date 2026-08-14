import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalSha256 } from './canonical-json.mjs'

const CONTENT_ADDRESSED_ASSET = /^[0-9a-f]{64}\.(?:avif|webp|opus|m4a|mp3|vtt)$/u
const AUDIO_SOURCE_EXTENSIONS = {
  opus: '.opus',
  aac: '.m4a',
  mp3: '.mp3',
  captions: '.vtt',
}
const ART_SOURCE_EXTENSIONS = { avif: '.avif', webp: '.webp' }
const APPROVED_RELEASE_SOURCE_COMMIT = 'da395a60865af7b0a744145eddf3f0aff4a2f357'
const RETIRED_DURATION_MIGRATION_COMMIT = '3e2e8f9a5ad14fb5efc74e322893c4dd0cb80fa2'
const REQUIRED_REVIEW_ROLES = [
  'prosecution',
  'defence',
  'judicial-neutrality',
  'accessibility',
  'sensitivity',
  'read-aloud',
  'blind-balance',
  'fixed-scope-criminal-law',
]

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value
}

function requireAssetName(value, extension, label) {
  if (typeof value !== 'string' || !CONTENT_ADDRESSED_ASSET.test(value) || extname(value) !== extension) {
    throw new Error(`${label} is not a content-addressed ${extension} asset.`)
  }
  return value
}

function collectRuntimeAssets(runtimeManifest) {
  if (!Array.isArray(runtimeManifest.sessions) || runtimeManifest.sessions.length !== 7) {
    throw new Error('Pinned runtime media manifest must contain exactly seven sessions.')
  }
  const assets = new Set()
  for (const [sessionIndex, sessionValue] of runtimeManifest.sessions.entries()) {
    const session = requireObject(sessionValue, `Runtime session ${sessionIndex + 1}`)
    if (!Array.isArray(session.segments)) {
      throw new Error(`Runtime session ${sessionIndex + 1} is missing audio segments.`)
    }
    for (const [segmentIndex, segmentValue] of session.segments.entries()) {
      const segment = requireObject(segmentValue, `Runtime segment ${sessionIndex + 1}.${segmentIndex + 1}`)
      const sources = requireObject(segment.sources, `Runtime segment ${sessionIndex + 1}.${segmentIndex + 1} sources`)
      for (const [source, extension] of Object.entries(AUDIO_SOURCE_EXTENSIONS)) {
        assets.add(requireAssetName(sources[source], extension, `Runtime ${source} source`))
      }
    }
    const art = requireObject(session.art, `Runtime session ${sessionIndex + 1} art`)
    if (!Array.isArray(art.strips)) {
      throw new Error(`Runtime session ${sessionIndex + 1} is missing art strips.`)
    }
    for (const [stripIndex, stripValue] of art.strips.entries()) {
      const strip = requireObject(stripValue, `Runtime art strip ${sessionIndex + 1}.${stripIndex + 1}`)
      const sources = requireObject(strip.sources, `Runtime art strip ${sessionIndex + 1}.${stripIndex + 1} sources`)
      for (const composition of ['portrait', 'tablet', 'desktop']) {
        const compositionSources = requireObject(sources[composition], `Runtime ${composition} art sources`)
        for (const [format, extension] of Object.entries(ART_SOURCE_EXTENSIONS)) {
          assets.add(requireAssetName(compositionSources[format], extension, `Runtime ${composition} ${format} source`))
        }
      }
    }
  }
  if (assets.size === 0) throw new Error('Pinned runtime media manifest references no Release assets.')
  return assets
}

function collectReleaseAssets(releaseManifest) {
  if (!Array.isArray(releaseManifest.assets) || releaseManifest.assets.length === 0) {
    throw new Error('Immutable Release manifest contains no media assets.')
  }
  const assets = new Set()
  let mediaBytes = 0
  for (const [index, assetValue] of releaseManifest.assets.entries()) {
    const asset = requireObject(assetValue, `Release asset ${index + 1}`)
    const extension = typeof asset.asset_name === 'string' ? extname(asset.asset_name) : ''
    const assetName = requireAssetName(asset.asset_name, extension, `Release asset ${index + 1}`)
    if (typeof asset.sha256 !== 'string' || asset.sha256 !== assetName.slice(0, 64)) {
      throw new Error(`Release asset ${assetName} does not match its declared SHA-256.`)
    }
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) {
      throw new Error(`Release asset ${assetName} has invalid byte metadata.`)
    }
    if (assets.has(assetName)) throw new Error(`Immutable Release manifest duplicates ${assetName}.`)
    assets.add(assetName)
    mediaBytes += asset.bytes
  }
  if (releaseManifest.asset_count !== assets.size + 1) {
    throw new Error(`Immutable Release manifest asset_count is ${releaseManifest.asset_count}; expected ${assets.size + 1} including release-manifest.json.`)
  }
  if (releaseManifest.media_bytes !== mediaBytes) {
    throw new Error(`Immutable Release manifest media_bytes is ${releaseManifest.media_bytes}; expected ${mediaBytes}.`)
  }
  return assets
}

export function assertReleasePayloadMatchesManifest(releaseManifestValue, releaseAssetsDirectory) {
  const releaseManifest = requireObject(releaseManifestValue, 'Immutable Release manifest')
  const expected = new Set(['release-manifest.json', ...releaseManifest.assets.map((asset) => asset.asset_name)])
  const releaseAssetsPath = resolve(releaseAssetsDirectory)
  const entries = readdirSync(releaseAssetsPath, { withFileTypes: true })
  if (entries.some((entry) => !entry.isFile())) throw new Error('Immutable Release payload must contain files only.')
  const actual = new Set(entries.map((entry) => entry.name))
  const missing = [...expected].filter((name) => !actual.has(name)).sort()
  const extra = [...actual].filter((name) => !expected.has(name)).sort()
  if (missing.length || extra.length) {
    throw new Error(
      `Attached Release inventory mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}.`,
    )
  }
  for (const asset of releaseManifest.assets) {
    const bytes = readFileSync(join(releaseAssetsPath, asset.asset_name))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== asset.bytes || sha256 !== asset.sha256) {
      throw new Error(
        `Attached Release asset ${asset.asset_name} failed integrity: bytes=${bytes.length}/${asset.bytes}, sha256=${sha256}/${asset.sha256}.`,
      )
    }
  }
}

export function assertReleasePayloadReadyForPublication(releaseManifestValue, releaseAssetsDirectory, expectedReleaseTag) {
  const releaseManifest = requireObject(releaseManifestValue, 'Reviewed Release manifest')
  if (releaseManifest.schema !== 'simjury.court-week-media/v1' || releaseManifest.case_id !== 'cw-0001') {
    throw new Error('Reviewed Release payload has an unsupported Court Week identity.')
  }
  if (releaseManifest.release_tag !== expectedReleaseTag) {
    throw new Error(
      `Reviewed Release tag mismatch: expected=${expectedReleaseTag ?? 'missing'}, release=${releaseManifest.release_tag ?? 'missing'}.`,
    )
  }
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(releaseManifest.review_content_digest ?? '') ||
    !/^sha256:[0-9a-f]{64}$/u.test(releaseManifest.runtime_manifest_digest ?? '') ||
    typeof releaseManifest.court_week_revision !== 'string' ||
    releaseManifest.court_week_revision.length === 0
  ) {
    throw new Error('Reviewed Release payload is missing its exact source and runtime-manifest identities.')
  }
  assertReleaseArtReady(releaseManifest)
  const assets = collectReleaseAssets(releaseManifest)
  assertReleasePayloadMatchesManifest(releaseManifest, releaseAssetsDirectory)

  const manifestBytes = readFileSync(join(resolve(releaseAssetsDirectory), 'release-manifest.json')).length
  const totalBytes = releaseManifest.media_bytes + manifestBytes
  if (releaseManifest.total_bytes !== totalBytes) {
    throw new Error(`Reviewed Release total_bytes is ${releaseManifest.total_bytes}; measured ${totalBytes}.`)
  }
  if (releaseManifest.asset_count >= 500 || totalBytes > 150_000_000) {
    throw new Error(`Reviewed Release payload exceeds its publication budget: ${releaseManifest.asset_count} files, ${totalBytes} bytes.`)
  }
  return { assetCount: assets.size, releaseTag: expectedReleaseTag, totalBytes }
}

function assertExactReviewSignoffs(reviewSignoffs, runtimeManifest, releaseManifest) {
  if (reviewSignoffs.schema !== 'simjury.court-week-review-signoffs/v1') {
    throw new Error(`Unsupported Court Week review signoff schema: ${reviewSignoffs.schema ?? 'missing'}.`)
  }
  if (
    reviewSignoffs.caseId !== runtimeManifest.case_id ||
    reviewSignoffs.caseId !== releaseManifest.case_id
  ) {
    throw new Error(`Court Week review case mismatch: signoffs=${reviewSignoffs.caseId ?? 'missing'}, runtime=${runtimeManifest.case_id}, release=${releaseManifest.case_id}.`)
  }
  if (
    reviewSignoffs.revision !== runtimeManifest.source_revision ||
    reviewSignoffs.revision !== releaseManifest.court_week_revision
  ) {
    throw new Error(`Court Week review revision mismatch: signoffs=${reviewSignoffs.revision ?? 'missing'}, runtime=${runtimeManifest.source_revision}, release=${releaseManifest.court_week_revision}.`)
  }
  if (!Array.isArray(reviewSignoffs.signoffs)) {
    throw new Error('Court Week review signoffs must contain all eight required roles.')
  }
  const decisions = new Map(reviewSignoffs.signoffs.map((entry) => [entry?.role, entry?.decision]))
  const validLedger = reviewSignoffs.signoffs.length === REQUIRED_REVIEW_ROLES.length &&
    decisions.size === REQUIRED_REVIEW_ROLES.length &&
    REQUIRED_REVIEW_ROLES.every((role) => ['pending', 'approved'].includes(decisions.get(role)))
  if (!validLedger || !/^sha256:[0-9a-f]{64}$/u.test(reviewSignoffs.contentDigest ?? '')) {
    throw new Error('Court Week review ledger must contain one valid decision for every required role and an exact digest.')
  }

  if (reviewSignoffs.pinnedMedia) {
    const pinned = requireObject(reviewSignoffs.pinnedMedia, 'Pinned media compatibility')
    if (
      pinned.schema !== 'simjury.court-week-pinned-media-compatibility/v1' ||
      pinned.releaseTag !== releaseManifest.release_tag ||
      pinned.releaseReviewDigest !== releaseManifest.review_content_digest ||
      !/^sha256:[0-9a-f]{64}$/u.test(pinned.mediaSourceDigest ?? '') ||
      pinned.releaseSourceCommit !== APPROVED_RELEASE_SOURCE_COMMIT ||
      pinned.metadataMigrationCommit !== RETIRED_DURATION_MIGRATION_COMMIT ||
      pinned.basis !== 'retired-duration-metadata-only'
    ) throw new Error('Pinned media compatibility does not match the immutable Release provenance.')
    return
  }

  if (reviewSignoffs.contentDigest !== releaseManifest.review_content_digest) {
    throw new Error(`Court Week reviewed-source digest mismatch: signoffs=${reviewSignoffs.contentDigest}, release=${releaseManifest.review_content_digest ?? 'missing'}.`)
  }
  if (
    REQUIRED_REVIEW_ROLES.some((role) => decisions.get(role) !== 'approved')
  ) {
    const pending = REQUIRED_REVIEW_ROLES.filter((role) => decisions.get(role) !== 'approved')
    throw new Error(`Court Week publication requires all eight exact-source signoffs; pending or invalid: ${pending.join(', ') || 'unknown role'}.`)
  }
}

function assertReleaseArtReady(releaseManifest) {
  const readiness = requireObject(releaseManifest.art_readiness, 'Immutable Release art_readiness')
  if (
    readiness.release_ready !== true ||
    readiness.crop_review_complete !== true ||
    readiness.scene_count !== 55 ||
    readiness.ready_scene_count !== 55 ||
    readiness.gap_count !== 0
  ) {
    throw new Error(
      `Immutable Release art is not ready: release_ready=${readiness.release_ready ?? 'missing'}, ` +
      `crop_review_complete=${readiness.crop_review_complete ?? 'missing'}, ` +
      `ready_scene_count=${readiness.ready_scene_count ?? 'missing'}, scene_count=${readiness.scene_count ?? 'missing'}, ` +
      `gap_count=${readiness.gap_count ?? 'missing'}.`,
    )
  }
}

export function assertPinnedMediaMatchesRelease(runtimeManifestValue, releaseManifestValue, reviewSignoffsValue, expectedReleaseTag) {
  const runtimeManifest = requireObject(runtimeManifestValue, 'Pinned runtime media manifest')
  const releaseManifest = requireObject(releaseManifestValue, 'Immutable Release manifest')
  const reviewSignoffs = requireObject(reviewSignoffsValue, 'Court Week review signoffs')
  if (runtimeManifest.schema !== 'simjury.court-week-runtime-media/v1') {
    throw new Error(`Unsupported pinned runtime media schema: ${runtimeManifest.schema ?? 'missing'}.`)
  }
  if (releaseManifest.schema !== 'simjury.court-week-media/v1') {
    throw new Error(`Unsupported immutable Release schema: ${releaseManifest.schema ?? 'missing'}.`)
  }
  if (
    runtimeManifest.case_id !== releaseManifest.case_id ||
    runtimeManifest.case_id !== 'cw-0001'
  ) {
    throw new Error(`Court Week case mismatch: runtime=${runtimeManifest.case_id ?? 'missing'}, release=${releaseManifest.case_id ?? 'missing'}.`)
  }
  if (
    runtimeManifest.source_revision !== releaseManifest.court_week_revision ||
    typeof runtimeManifest.source_revision !== 'string' ||
    runtimeManifest.source_revision.length === 0
  ) {
    throw new Error(`Court Week revision mismatch: runtime=${runtimeManifest.source_revision ?? 'missing'}, release=${releaseManifest.court_week_revision ?? 'missing'}.`)
  }
  if (
    typeof expectedReleaseTag !== 'string' ||
    runtimeManifest.release_tag !== expectedReleaseTag ||
    releaseManifest.release_tag !== expectedReleaseTag
  ) {
    throw new Error(`Court Week Release tag mismatch: expected=${expectedReleaseTag ?? 'missing'}, runtime=${runtimeManifest.release_tag ?? 'missing'}, release=${releaseManifest.release_tag ?? 'missing'}.`)
  }
  assertExactReviewSignoffs(reviewSignoffs, runtimeManifest, releaseManifest)
  assertReleaseArtReady(releaseManifest)
  const runtimeManifestDigest = canonicalSha256(runtimeManifest)
  if (releaseManifest.runtime_manifest_digest !== runtimeManifestDigest) {
    throw new Error(
      `Pinned runtime mapping digest mismatch: runtime=${runtimeManifestDigest}, release=${releaseManifest.runtime_manifest_digest ?? 'missing'}.`,
    )
  }

  const runtimeAssets = collectRuntimeAssets(runtimeManifest)
  const releaseAssets = collectReleaseAssets(releaseManifest)
  const missing = [...runtimeAssets].filter((asset) => !releaseAssets.has(asset)).sort()
  const extra = [...releaseAssets].filter((asset) => !runtimeAssets.has(asset)).sort()
  if (missing.length || extra.length) {
    throw new Error(
      `Pinned runtime/Release asset set mismatch; missing from Release: ${missing.join(', ') || 'none'}; ` +
      `extra in Release: ${extra.join(', ') || 'none'}.`,
    )
  }
  return { caseId: runtimeManifest.case_id, revision: runtimeManifest.source_revision, releaseTag: expectedReleaseTag, assetCount: runtimeAssets.size }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const releasePath = argument('--release-manifest')
  const releaseAssetsDirectory = argument('--release-assets-dir')
  const expectedReleaseTag = argument('--expected-release-tag')
  if (process.argv.includes('--release-payload-only')) {
    if (!releasePath || !releaseAssetsDirectory || !expectedReleaseTag) {
      throw new Error('Payload verification requires --release-manifest, --release-assets-dir and --expected-release-tag.')
    }
    const result = assertReleasePayloadReadyForPublication(
      JSON.parse(readFileSync(resolve(releasePath), 'utf8')),
      releaseAssetsDirectory,
      expectedReleaseTag,
    )
    console.log(`Reviewed Release payload matches ${result.assetCount} content-addressed assets in ${result.releaseTag}.`)
  } else {
    const runtimePath = argument('--runtime-manifest')
    const reviewSignoffsPath = argument('--review-signoffs')
    if (!runtimePath || !releasePath || !reviewSignoffsPath || !releaseAssetsDirectory || !expectedReleaseTag) {
      throw new Error('Use --runtime-manifest, --release-manifest, --review-signoffs, --release-assets-dir and --expected-release-tag.')
    }
    const releaseManifest = JSON.parse(readFileSync(resolve(releasePath), 'utf8'))
    const result = assertPinnedMediaMatchesRelease(
      JSON.parse(readFileSync(resolve(runtimePath), 'utf8')),
      releaseManifest,
      JSON.parse(readFileSync(resolve(reviewSignoffsPath), 'utf8')),
      expectedReleaseTag,
    )
    assertReleasePayloadMatchesManifest(releaseManifest, releaseAssetsDirectory)
    console.log(`Pinned runtime media matches ${result.assetCount} content-addressed assets in ${result.releaseTag}.`)
  }
}
