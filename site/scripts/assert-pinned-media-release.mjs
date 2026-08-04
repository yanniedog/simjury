import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTENT_ADDRESSED_ASSET = /^[0-9a-f]{64}\.(?:avif|webp|opus|m4a|mp3|vtt)$/u
const AUDIO_SOURCE_EXTENSIONS = {
  opus: '.opus',
  aac: '.m4a',
  mp3: '.mp3',
  captions: '.vtt',
}
const ART_SOURCE_EXTENSIONS = { avif: '.avif', webp: '.webp' }
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
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(reviewSignoffs.contentDigest ?? '') ||
    reviewSignoffs.contentDigest !== releaseManifest.review_content_digest
  ) {
    throw new Error(`Court Week reviewed-source digest mismatch: signoffs=${reviewSignoffs.contentDigest ?? 'missing'}, release=${releaseManifest.review_content_digest ?? 'missing'}.`)
  }
  if (!Array.isArray(reviewSignoffs.signoffs)) {
    throw new Error('Court Week review signoffs must contain all eight required roles.')
  }
  const decisions = new Map(reviewSignoffs.signoffs.map((entry) => [entry?.role, entry?.decision]))
  if (
    reviewSignoffs.signoffs.length !== REQUIRED_REVIEW_ROLES.length ||
    decisions.size !== REQUIRED_REVIEW_ROLES.length ||
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
    readiness.scene_count !== 55 ||
    readiness.ready_scene_count !== 55 ||
    readiness.gap_count !== 0
  ) {
    throw new Error(
      `Immutable Release art is not ready: release_ready=${readiness.release_ready ?? 'missing'}, ` +
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
  const runtimePath = argument('--runtime-manifest')
  const releasePath = argument('--release-manifest')
  const reviewSignoffsPath = argument('--review-signoffs')
  const expectedReleaseTag = argument('--expected-release-tag')
  if (!runtimePath || !releasePath || !reviewSignoffsPath || !expectedReleaseTag) {
    throw new Error('Use --runtime-manifest, --release-manifest, --review-signoffs and --expected-release-tag.')
  }
  const result = assertPinnedMediaMatchesRelease(
    JSON.parse(readFileSync(resolve(runtimePath), 'utf8')),
    JSON.parse(readFileSync(resolve(releasePath), 'utf8')),
    JSON.parse(readFileSync(resolve(reviewSignoffsPath), 'utf8')),
    expectedReleaseTag,
  )
  console.log(`Pinned runtime media matches ${result.assetCount} content-addressed assets in ${result.releaseTag}.`)
}
