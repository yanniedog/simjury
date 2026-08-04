import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessSceneArtManifest } from './scene-art-readiness.mjs'
import { canonicalSha256 } from './canonical-json.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(siteRoot, '..')
const visualSourceRoot = join(siteRoot, 'court-week-art', 'cw-0001')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const releaseTag = argument('--release-tag')
const outputRoot = resolve(argument('--output-root') ?? join(repoRoot, '.court-week-release'))
const audioRootArgument = argument('--audio-root')
const audioRoot = audioRootArgument ? resolve(audioRootArgument) : undefined
const jobsRootArgument = argument('--jobs-root')
const jobsRoot = jobsRootArgument ? resolve(jobsRootArgument) : undefined
const reviewSignoffsArgument = argument('--review-signoffs')
const reviewSignoffsPath = reviewSignoffsArgument ? resolve(reviewSignoffsArgument) : undefined
const artRequirementsArgument = argument('--art-requirements')
const artRequirementsPath = artRequirementsArgument ? resolve(artRequirementsArgument) : undefined
const artRootArgument = argument('--art-root')
const artRoot = artRootArgument ? resolve(artRootArgument) : undefined
const artStripsArgument = argument('--art-strips')
const artStripsPath = artStripsArgument ? resolve(artStripsArgument) : undefined
const privateOutputRoot = resolve(argument('--private-output-root') ?? `${outputRoot}-private`)
const requireReleaseReadyArt = process.argv.includes('--require-release-ready-art')
if (!/^court-week-cw-0001-[0-9]{4}\.[0-9]{2}\.[0-9]{2}-r[1-9][0-9]*$/.test(releaseTag ?? '')) {
  throw new Error('Use --release-tag court-week-cw-0001-YYYY.MM.DD-rN')
}
if (!existsSync(visualSourceRoot)) throw new Error(`Missing reviewed media source: ${visualSourceRoot}`)
if (!audioRoot || !existsSync(audioRoot)) throw new Error('Use --audio-root with the complete generated Court Week audio directory')
if (!jobsRoot || !existsSync(jobsRoot)) {
  throw new Error('Generated audio must be packaged with --jobs-root from the exact reviewed source job')
}
if (!reviewSignoffsPath || !existsSync(reviewSignoffsPath)) {
  throw new Error('Use --review-signoffs with the exact reviewed-source report')
}
if (!artRequirementsPath || !existsSync(artRequirementsPath)) {
  throw new Error('Use --art-requirements with the exact reviewed SceneArtManifest artifact')
}
if (!artRoot || !existsSync(artRoot) || !artStripsPath || !existsSync(artStripsPath)) {
  throw new Error('Use --art-root and --art-strips with the deterministic two-scene strip artifact')
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

const allowedExtensions = new Set(['.avif', '.webp', '.opus', '.m4a', '.mp3', '.vtt'])
const sources = [
  ...filesBelow(artRoot)
    .filter((path) => path !== artStripsPath)
    .map((path) => ({
    path,
    logicalPath: `art/${relative(artRoot, path).split(sep).join('/')}`,
  })),
  ...filesBelow(audioRoot)
    .filter((path) => path.split(sep).at(-1) !== 'session-media.json')
    .map((path) => ({
      path,
      logicalPath: `audio/${relative(audioRoot, path).split(sep).join('/')}`,
    })),
].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath))
if (!sources.length) throw new Error('Court Week media source is empty')

rmSync(outputRoot, { recursive: true, force: true })
rmSync(privateOutputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })
mkdirSync(privateOutputRoot, { recursive: true })

const reviewSignoffs = JSON.parse(readFileSync(reviewSignoffsPath, 'utf8'))
if (
  reviewSignoffs.schema !== 'simjury.court-week-review-report/v1' ||
  reviewSignoffs.caseId !== 'cw-0001' ||
  !/^sha256:[0-9a-f]{64}$/.test(reviewSignoffs.contentDigest) ||
  !Array.isArray(reviewSignoffs.pendingRoles) ||
  typeof reviewSignoffs.exactSourceMatch !== 'boolean' ||
  typeof reviewSignoffs.readyToPublish !== 'boolean'
) {
  throw new Error('Unsupported or incomplete Court Week reviewed-source report')
}
cpSync(reviewSignoffsPath, join(privateOutputRoot, 'review-signoffs.json'))

const seenNames = new Set()
const assets = sources.map(({ path, logicalPath }) => {
  const extension = extname(path).toLowerCase()
  if (!allowedExtensions.has(extension)) throw new Error(`Unsupported media type: ${path}`)
  const bytes = readFileSync(path)
  if (bytes.length > 12_000_000) throw new Error(`Asset exceeds 12 MB: ${path}`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const assetName = `${sha256}${extension}`
  if (!seenNames.has(assetName)) {
    cpSync(path, join(outputRoot, assetName))
    seenNames.add(assetName)
  }
  return {
    logical_path: logicalPath,
    asset_name: assetName,
    bytes: bytes.length,
    sha256,
  }
})

const assetByLogicalPath = new Map(assets.map((asset) => [asset.logical_path, asset]))
if (seenNames.size + 1 >= 500) {
  throw new Error(`Release would have ${seenNames.size + 1} assets; it must remain below 500`)
}

const artRequirements = JSON.parse(readFileSync(artRequirementsPath, 'utf8'))
const artReadiness = assessSceneArtManifest(artRequirements, visualSourceRoot)
writeFileSync(join(privateOutputRoot, 'art-readiness-report.json'), `${JSON.stringify(artReadiness, null, 2)}\n`)
if (artReadiness.release_ready && artReadiness.crop_review_complete) {
  console.log(`Scene art is release-ready and crop-reviewed: ${artReadiness.ready_scene_count}/${artReadiness.scene_count} dedicated scenes.`)
} else {
  console.warn(`Scene art is not publication-ready: ${artReadiness.ready_scene_count}/${artReadiness.scene_count} scenes; ${artReadiness.gap_count} gaps; crop_review_complete=${artReadiness.crop_review_complete}.`)
  for (const gap of artReadiness.gaps) {
    console.warn(`ART GAP [${gap.scene_id ?? 'manifest'}] ${gap.code} ${gap.field}: ${gap.message}`)
  }
  if (requireReleaseReadyArt) {
    throw new Error('Release publication is blocked until SceneArtManifest gaps are closed and every composition is crop-reviewed; see art-readiness-report.json')
  }
}

const artStrips = JSON.parse(readFileSync(artStripsPath, 'utf8'))
const expectedCompositions = {
  portrait: { tile: { width: 720, height: 1280 }, strip: { width: 1440, height: 1280 } },
  tablet: { tile: { width: 1024, height: 768 }, strip: { width: 2048, height: 768 } },
  desktop: { tile: { width: 1280, height: 720 }, strip: { width: 2560, height: 720 } },
}
if (
  artStrips.schema !== 'simjury.scene-art-strip-source/v1' ||
  artStrips.caseId !== 'cw-0001' ||
  artStrips.sourceRevision !== artRequirements.sourceRevision ||
  JSON.stringify(artStrips.grid) !== JSON.stringify({ columns: 2, rows: 1 }) ||
  JSON.stringify(artStrips.compositions) !== JSON.stringify(expectedCompositions)
) {
  throw new Error('Unsupported or mismatched two-scene art strip manifest')
}
const readySceneIds = new Set(artReadiness.ready_scene_ids)
const expectedArtSessions = artRequirements.sessions.filter((session) =>
  session.sceneIds.every((sceneId) => readySceneIds.has(sceneId)))
const expectedStripCount = expectedArtSessions.reduce(
  (count, session) => count + Math.ceil(session.sceneIds.length / 2), 0,
)
if (artStrips.strips.length !== expectedStripCount) {
  throw new Error(`Art strip artifact has ${artStrips.strips.length} strips; ${expectedStripCount} are expected`)
}
const artBySession = new Map()
const referencedArtPaths = new Set()
for (const session of expectedArtSessions) {
  const strips = artStrips.strips
    .filter((strip) => strip.sessionId === session.id)
    .sort((left, right) => left.stripIndex - right.stripIndex)
  if (strips.some((strip, index) => strip.stripIndex !== index)) {
    throw new Error(`Art strips are not consecutive for ${session.id}`)
  }
  const mappedSceneIds = strips.flatMap((strip) =>
    strip.sceneSlots.map((slot, cell) => {
      if (slot.cell !== cell) throw new Error(`Non-chronological art cell in ${session.id}`)
      return slot.sceneId
    }))
  if (JSON.stringify(mappedSceneIds) !== JSON.stringify(session.sceneIds)) {
    throw new Error(`Art strips do not map the exact scene order for ${session.id}`)
  }
  const runtimeStrips = strips.map((strip) => ({
    strip_index: strip.stripIndex + 1,
    scene_slots: strip.sceneSlots.map((slot) => ({ scene_id: slot.sceneId, cell: slot.cell })),
    sources: Object.fromEntries(['portrait', 'tablet', 'desktop'].map((composition) => [
      composition,
      Object.fromEntries(['avif', 'webp'].map((format) => {
        const logicalPath = `art/${strip.sources?.[composition]?.[format]}`
        const asset = assetByLogicalPath.get(logicalPath)
        if (!asset) throw new Error(`Missing art strip asset: ${logicalPath}`)
        referencedArtPaths.add(logicalPath)
        return [format, asset.asset_name]
      })),
    ])),
  }))
  artBySession.set(session.id, {
    grid: artStrips.grid,
    compositions: Object.fromEntries(Object.entries(artStrips.compositions).map(([name, value]) => [
      name,
      {
        tile_width: value.tile.width,
        tile_height: value.tile.height,
        strip_width: value.strip.width,
        strip_height: value.strip.height,
      },
    ])),
    strips: runtimeStrips,
  })
}
const packagedArtPaths = assets.map((asset) => asset.logical_path).filter((path) => path.startsWith('art/'))
const unreferencedArt = packagedArtPaths.filter((path) => !referencedArtPaths.has(path))
if (unreferencedArt.length) throw new Error(`Unreferenced art strip assets: ${unreferencedArt.join(', ')}`)
// This source manifest is private review evidence, not a public release asset.
// Preserve its crop geometry and provenance beside the packaged contact sheets.
cpSync(artStripsPath, join(privateOutputRoot, 'scene-art-strips.source.json'))

function loadAudioSessions() {
  const index = JSON.parse(readFileSync(join(jobsRoot, 'index.json'), 'utf8'))
  if (index.schema !== 'simjury.court-week-audio-index/v1' || index.caseId !== 'cw-0001' || index.sessionCount !== 7) {
    throw new Error('Unsupported or incomplete Court Week audio job index')
  }
  if (index.releaseTag !== releaseTag) throw new Error(`Audio jobs target ${index.releaseTag}, not ${releaseTag}`)
  const jobs = new Map(index.jobs.map((entry) => {
    const job = JSON.parse(readFileSync(join(jobsRoot, entry.path), 'utf8'))
    if (job.sourceDigest !== entry.sourceDigest || job.sessionId !== entry.sessionId) {
      throw new Error(`Audio job index mismatch for ${entry.sessionId}`)
    }
    return [job.sessionId, job]
  }))
  const manifestPaths = filesBelow(audioRoot)
    .filter((path) => path.split(sep).at(-1) === 'session-media.json')
    .sort((left, right) => left.localeCompare(right))
  if (manifestPaths.length !== 7) throw new Error(`Expected seven session-media manifests; found ${manifestPaths.length}`)
  const parsedSessions = manifestPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')))
  const expectedIds = [
    'cw-0001-monday', 'cw-0001-tuesday', 'cw-0001-wednesday', 'cw-0001-thursday',
    'cw-0001-friday', 'cw-0001-saturday', 'cw-0001-sunday',
  ]
  if (JSON.stringify(parsedSessions.map((session) => session.sessionId).sort()) !== JSON.stringify([...expectedIds].sort())) {
    throw new Error('Session media manifests do not cover the exact Monday-Sunday Court Week')
  }
  const sessions = expectedIds.map((id) => parsedSessions.find((session) => session.sessionId === id))
  const seenCueIds = new Set()
  const referencedAudioPaths = new Set()
  let productionEnvironment
  for (const session of sessions) {
    if (session.schema !== 'simjury.court-week-session-media/v1' || session.caseId !== 'cw-0001') {
      throw new Error(`Unsupported session media manifest for ${session.sessionId}`)
    }
    if (session.releaseTag !== releaseTag) throw new Error(`${session.sessionId} was built for ${session.releaseTag}, not ${releaseTag}`)
    if (!session.productionEnvironment || typeof session.productionEnvironment !== 'object') {
      throw new Error(`${session.sessionId} is missing production environment provenance`)
    }
    if (productionEnvironment && JSON.stringify(session.productionEnvironment) !== JSON.stringify(productionEnvironment)) {
      throw new Error('Court Week sessions were not produced by one consistent audio environment')
    }
    productionEnvironment ??= session.productionEnvironment
    const job = jobs.get(session.sessionId)
    if (!job || session.sourceDigest !== job.sourceDigest || session.sourceRevision !== job.sourceRevision) {
      throw new Error(`${session.sessionId} media does not match its reviewed source job`)
    }
    if (!Array.isArray(session.segments) || session.segments.length < 8 || session.segments.length > 12) {
      throw new Error(`${session.sessionId} must have 8-12 prerecorded audio segments`)
    }
    if (session.experienceSeconds < 18 * 60 || session.experienceSeconds > 22 * 60) {
      throw new Error(`${session.sessionId} measures ${(session.experienceSeconds / 60).toFixed(2)} minutes; required 18-22`)
    }
    const codecBytes = { opus: 0, aac: 0, mp3: 0 }
    for (const [segmentIndex, segment] of session.segments.entries()) {
      if (!/^[0-9a-f]{32}$/.test(segment.opaqueId)) throw new Error(`Unsafe audio segment id in ${session.sessionId}`)
      const jobSegment = job.segments[segmentIndex]
      if (!jobSegment || segment.id !== jobSegment.id || segment.opaqueId !== jobSegment.opaqueId || segment.sourceSceneId !== jobSegment.sourceSceneId) {
        throw new Error(`Audio segment order/source mismatch in ${session.sessionId} at position ${segmentIndex + 1}`)
      }
      for (const source of ['opus', 'aac', 'mp3', 'captions']) {
        const logicalPath = `audio/${segment.sources[source]}`
        const asset = assetByLogicalPath.get(logicalPath)
        if (!asset) throw new Error(`Missing ${source} asset for ${segment.opaqueId}: ${logicalPath}`)
        referencedAudioPaths.add(logicalPath)
        if (source !== 'captions') codecBytes[source] += asset.bytes
      }
      if (segment.cues.length !== jobSegment.cues.length) throw new Error(`Cue count mismatch for ${segment.id}`)
      for (const [cueIndex, cue] of segment.cues.entries()) {
        const jobCue = jobSegment.cues[cueIndex]
        if (cue.cueId !== jobCue?.id) throw new Error(`Cue order mismatch for ${segment.id}`)
        if (jobCue.sourceCueId && cue.sourceCueId && cue.sourceCueId !== jobCue.sourceCueId) {
          throw new Error(`sourceCueId mismatch for ${cue.cueId}`)
        }
        if (seenCueIds.has(cue.cueId)) throw new Error(`Duplicate audio utterance mapping: ${cue.cueId}`)
        seenCueIds.add(cue.cueId)
        if (!(cue.startSeconds >= 0 && cue.endSeconds > cue.startSeconds && cue.endSeconds <= segment.durationSeconds + 0.15)) {
          throw new Error(`Invalid cue range for ${cue.cueId}`)
        }
      }
      for (const codec of ['opus', 'aac', 'mp3']) {
        const measured = segment.loudness[codec]
        if (measured.integratedLufs < -20 || measured.integratedLufs > -16 || measured.truePeakDbtp > -0.5 || measured.loudnessRangeLu > 12) {
          throw new Error(`Loudness validation failed for ${segment.opaqueId}.${codec}`)
        }
      }
    }
    for (const [codec, bytes] of Object.entries(codecBytes)) {
      if (bytes > 15_000_000) throw new Error(`${session.sessionId} ${codec} transfer is ${bytes} bytes; limit is 15 MB`)
    }
  }
  for (const codec of ['opus', 'aac', 'mp3']) {
    const bytes = sessions.reduce((week, session) => week + session.segments.reduce((day, segment) => {
      const asset = assetByLogicalPath.get(`audio/${segment.sources[codec]}`)
      return day + (asset?.bytes ?? 0)
    }, 0), 0)
    if (bytes > 100_000_000) throw new Error(`${codec} normal-week path is ${bytes} bytes; limit is 100 MB`)
  }
  const packagedAudioPaths = assets
    .map((asset) => asset.logical_path)
    .filter((path) => path.startsWith('audio/'))
  const unreferenced = packagedAudioPaths.filter((path) => !referencedAudioPaths.has(path))
  if (unreferenced.length) throw new Error(`Unreferenced generated audio assets: ${unreferenced.join(', ')}`)
  const expectedCueCount = [...jobs.values()].reduce((count, job) =>
    count + job.segments.reduce((segmentCount, segment) => segmentCount + segment.cues.length, 0), 0)
  if (seenCueIds.size !== expectedCueCount) {
    throw new Error(`Runtime media maps ${seenCueIds.size} utterances; reviewed jobs require ${expectedCueCount}`)
  }
  return { sessions, jobs }
}

function collapseAuthoredCueRanges(cues, jobCues) {
  const ranges = new Map()
  for (const [index, cue] of cues.entries()) {
    const sourceCueId = cue.sourceCueId ?? jobCues[index]?.sourceCueId ?? cue.cueId
    const existing = ranges.get(sourceCueId)
    if (!existing) {
      ranges.set(sourceCueId, {
        cue_id: sourceCueId,
        start_seconds: cue.startSeconds,
        end_seconds: cue.endSeconds,
        turns: [{
          turn_id: cue.cueId,
          start_seconds: cue.startSeconds,
          end_seconds: cue.endSeconds,
        }],
      })
      continue
    }
    existing.start_seconds = Math.min(existing.start_seconds, cue.startSeconds)
    existing.end_seconds = Math.max(existing.end_seconds, cue.endSeconds)
    existing.turns.push({
      turn_id: cue.cueId,
      start_seconds: cue.startSeconds,
      end_seconds: cue.endSeconds,
    })
  }
  return [...ranges.values()]
}

const { sessions: audioSessions, jobs: jobsBySession } = loadAudioSessions()
if (artRequirements.sourceRevision !== audioSessions[0]?.sourceRevision) {
  throw new Error('SceneArtManifest and prerecorded audio were not derived from the same Court Week revision')
}
if (reviewSignoffs.revision !== audioSessions[0]?.sourceRevision) {
  throw new Error('Review signoffs and prerecorded audio were not derived from the same Court Week revision')
}
const runtimeMediaManifest = {
  schema: 'simjury.court-week-runtime-media/v1',
  case_id: 'cw-0001',
  release_tag: releaseTag,
  source_revision: audioSessions[0]?.sourceRevision ?? null,
  sessions: audioSessions.map((session) => {
    const job = jobsBySession.get(session.sessionId)
    return {
      session_id: session.sessionId,
      day: session.day,
      narration_seconds: session.narrationSeconds,
      experience_seconds: session.experienceSeconds,
      segments: session.segments.map((segment, segmentIndex) => ({
        id: segment.id,
        source_scene_id: segment.sourceSceneId,
        duration_seconds: segment.durationSeconds,
        cues: collapseAuthoredCueRanges(segment.cues, job?.segments[segmentIndex]?.cues ?? []),
        sources: Object.fromEntries(Object.entries(segment.sources).map(([codec, path]) => {
          const asset = assetByLogicalPath.get(`audio/${path}`)
          if (!asset) throw new Error(`Missing release asset for ${path}`)
          return [codec, asset.asset_name]
        })),
      })),
      art: artBySession.get(session.sessionId) ?? null,
    }
  }),
}
const runtimeManifestName = artReadiness.release_ready
  ? 'court-week-media-manifest.json'
  : 'court-week-media-manifest.draft.json'
writeFileSync(join(privateOutputRoot, runtimeManifestName), `${JSON.stringify(runtimeMediaManifest, null, 2)}\n`)
const runtimeManifestDigest = canonicalSha256(runtimeMediaManifest)

const mediaBytes = [...seenNames].reduce((sum, name) => sum + readFileSync(join(outputRoot, name)).length, 0)
if (mediaBytes > 150_000_000) throw new Error(`Release media is ${mediaBytes} bytes; budget is 150 MB`)

const publicAssets = [...new Map(assets.map(({ asset_name, bytes, sha256 }) => [
  asset_name, { asset_name, bytes, sha256 },
])).values()]

function serializeReleaseManifest(totalBytes) {
  return `${JSON.stringify({
    schema: 'simjury.court-week-media/v1',
    case_id: 'cw-0001',
    release_tag: releaseTag,
    court_week_revision: reviewSignoffs.revision,
    review_content_digest: reviewSignoffs.contentDigest,
    runtime_manifest_digest: runtimeManifestDigest,
    source_revision: process.env.GITHUB_SHA ?? 'local-unpublished',
    generated_at: process.env.GITHUB_RUN_ID ? new Date().toISOString() : null,
    production_environment: audioSessions[0]?.productionEnvironment ?? null,
    art_readiness: {
      release_ready: artReadiness.release_ready,
      crop_review_complete: artReadiness.crop_review_complete,
      scene_count: artReadiness.scene_count,
      ready_scene_count: artReadiness.ready_scene_count,
      gap_count: artReadiness.gap_count,
    },
    asset_count: seenNames.size + 1,
    media_bytes: mediaBytes,
    total_bytes: totalBytes,
    assets: publicAssets,
  }, null, 2)}\n`
}

let releaseManifestBody = serializeReleaseManifest(mediaBytes)
let totalBytes = mediaBytes + Buffer.byteLength(releaseManifestBody)
releaseManifestBody = serializeReleaseManifest(totalBytes)
totalBytes = mediaBytes + Buffer.byteLength(releaseManifestBody)
releaseManifestBody = serializeReleaseManifest(totalBytes)
if (mediaBytes + Buffer.byteLength(releaseManifestBody) !== totalBytes) {
  totalBytes = mediaBytes + Buffer.byteLength(releaseManifestBody)
  releaseManifestBody = serializeReleaseManifest(totalBytes)
}
if (totalBytes > 150_000_000) throw new Error(`Release is ${totalBytes} bytes; budget is 150 MB`)
writeFileSync(join(outputRoot, 'release-manifest.json'), releaseManifestBody)

writeFileSync(join(privateOutputRoot, 'release-provenance.json'), `${JSON.stringify({
  schema: 'simjury.court-week-media-provenance/v1',
  case_id: 'cw-0001',
  release_tag: releaseTag,
  review_content_digest: reviewSignoffs.contentDigest,
  source_revision: audioSessions[0]?.sourceRevision ?? null,
  public_asset_count: seenNames.size + 1,
  assets,
}, null, 2)}\n`)

console.log(`Prepared ${seenNames.size} content-addressed media assets (${totalBytes} bytes) for ${releaseTag}.`)
