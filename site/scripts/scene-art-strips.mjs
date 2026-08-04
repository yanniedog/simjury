import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { assessSceneArtManifest } from './scene-art-readiness.mjs'

const COMPOSITIONS = ['portrait', 'tablet', 'desktop']
const FORMATS = ['avif', 'webp']
const STRIP_JOB_CONCURRENCY = 2
const AVIF_OPTIONS = { quality: 70, effort: 4, chromaSubsampling: '4:2:0' }
const WEBP_OPTIONS = { quality: 90, effort: 4, smartSubsample: true }
const TILE_DIMENSIONS = {
  portrait: { width: 720, height: 1280 },
  tablet: { width: 1024, height: 768 },
  desktop: { width: 1280, height: 720 },
}
const CANONICAL_SESSIONS = [
  { id: 'cw-0001-monday', ordinal: 1, day: 'Monday' },
  { id: 'cw-0001-tuesday', ordinal: 2, day: 'Tuesday' },
  { id: 'cw-0001-wednesday', ordinal: 3, day: 'Wednesday' },
  { id: 'cw-0001-thursday', ordinal: 4, day: 'Thursday' },
  { id: 'cw-0001-friday', ordinal: 5, day: 'Friday' },
  { id: 'cw-0001-saturday', ordinal: 6, day: 'Saturday' },
  { id: 'cw-0001-sunday', ordinal: 7, day: 'Sunday' },
]

function pathContainedBy(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child))
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
}

function safePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) {
    throw new Error(`Unsafe art path: ${relativePath}`)
  }
  const base = resolve(root)
  const target = resolve(base, relativePath)
  if (!pathContainedBy(base, target) || target === base) throw new Error(`Art path escapes its root: ${relativePath}`)
  return target
}

function assertCanonicalSessionTopology(requirements) {
  if (requirements?.caseId !== 'cw-0001') {
    throw new Error('Scene-art strip builds are locked to caseId cw-0001 (Eleven Minutes).')
  }
  if (!Array.isArray(requirements.sessions) || requirements.sessions.length !== 7) {
    throw new Error('Scene-art requirements must carry seven ordered Court Week sessions.')
  }
  for (const [index, expected] of CANONICAL_SESSIONS.entries()) {
    const session = requirements.sessions[index]
    if (
      session?.id !== expected.id ||
      session?.ordinal !== expected.ordinal ||
      session?.day !== expected.day ||
      !Array.isArray(session.sceneIds) ||
      session.sceneIds.length === 0
    ) {
      throw new Error(
        `Scene-art session topology mismatch at index ${index}: expected ${expected.id} ordinal ${expected.ordinal}.`,
      )
    }
    if (new Set(session.sceneIds).size !== session.sceneIds.length) {
      throw new Error(`Scene-art session ${session.id} repeats scene IDs.`)
    }
  }
  const orderedIds = requirements.sessions.flatMap((session) => session.sceneIds)
  if (orderedIds.length !== 55 || new Set(orderedIds).size !== 55) {
    throw new Error('Scene-art session order must map each of the 55 scenes exactly once.')
  }
  const manifestSceneIds = Object.keys(requirements.scenes ?? {})
  if (manifestSceneIds.length !== 55) {
    throw new Error(`Scene-art requirements.scenes must define exactly 55 scenes; found ${manifestSceneIds.length}.`)
  }
  const orderedSet = new Set(orderedIds)
  const missingFromManifest = orderedIds.filter((sceneId) => !(sceneId in (requirements.scenes ?? {})))
  const unusedManifestScenes = manifestSceneIds.filter((sceneId) => !orderedSet.has(sceneId))
  if (missingFromManifest.length || unusedManifestScenes.length) {
    throw new Error(
      `Scene-art session IDs must match requirements.scenes exactly (missing=${missingFromManifest.join(',') || 'none'}; unused=${unusedManifestScenes.join(',') || 'none'}).`,
    )
  }
}

export async function renderStripRendition({ mediaRoot, outputRoot, sourcePaths, outputPath, composition, format }) {
  if (!COMPOSITIONS.includes(composition) || !FORMATS.includes(format)) {
    throw new Error(`Unsupported strip rendition: ${composition}.${format}`)
  }
  const tile = TILE_DIMENSIONS[composition]
  const inputs = await Promise.all(sourcePaths.map(async (path, cell) => {
    // Readiness already enforces composition aspect ratio; resize to exact tile
    // pixels as raw pixels, avoiding an intermediate lossy encode/decode cycle.
    const { data, info } = await sharp(safePath(mediaRoot, path))
      .resize(tile.width, tile.height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    return {
      input: data,
      raw: { width: info.width, height: info.height, channels: info.channels },
      left: cell * tile.width,
      top: 0,
    }
  }))
  const { data, info } = await sharp({
    create: {
      width: tile.width * 2,
      height: tile.height,
      channels: 3,
      background: '#0d1215',
    },
  }).composite(inputs).raw().toBuffer({ resolveWithObject: true })
  const target = safePath(outputRoot, outputPath)
  const pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
  mkdirSync(dirname(target), { recursive: true })
  if (format === 'avif') await pipeline.avif(AVIF_OPTIONS).toFile(target)
  else await pipeline.webp(WEBP_OPTIONS).toFile(target)
}

async function runBounded(tasks, concurrency) {
  let next = 0
  let failure
  async function worker() {
    while (!failure && next < tasks.length) {
      const task = tasks[next]
      next += 1
      try {
        await task()
      } catch (error) {
        failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  if (failure) throw failure
}

export async function buildSceneArtStrips({ requirements, mediaRoot, outputRoot }) {
  const sourceRoot = resolve(mediaRoot)
  const destination = resolve(outputRoot)
  if (
    pathContainedBy(sourceRoot, destination) ||
    pathContainedBy(destination, sourceRoot)
  ) {
    throw new Error('Strip output must stay disjoint from the reviewed conventional-art source root.')
  }
  assertCanonicalSessionTopology(requirements)

  sharp.cache(false)
  sharp.concurrency(2)
  const readiness = assessSceneArtManifest(requirements, sourceRoot)
  const blockingGaps = readiness.gaps.filter((gap) =>
    gap.code === 'invalid-manifest' || gap.code === 'scene-count',
  )
  if (blockingGaps.length) {
    throw new Error(
      `Scene-art strip build rejected manifest-level readiness failure: ${blockingGaps.map((gap) => gap.message).join('; ')}`,
    )
  }

  if (existsSync(destination)) rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  const ready = new Set(readiness.ready_scene_ids)
  const strips = []
  const renderTasks = []

  for (const session of requirements.sessions) {
    if (!session.sceneIds.every((sceneId) => ready.has(sceneId))) continue
    for (let sceneIndex = 0; sceneIndex < session.sceneIds.length; sceneIndex += 2) {
      const sceneIds = session.sceneIds.slice(sceneIndex, sceneIndex + 2)
      const stripIndex = sceneIndex / 2
      const sources = {}
      for (const composition of COMPOSITIONS) {
        sources[composition] = {}
        for (const format of FORMATS) {
          const outputPath = `strips/day-${String(session.ordinal).padStart(2, '0')}/strip-${String(stripIndex + 1).padStart(2, '0')}/${composition}.${format}`
          sources[composition][format] = outputPath
          renderTasks.push(() => renderStripRendition({
            mediaRoot: sourceRoot,
            outputRoot: destination,
            sourcePaths: sceneIds.map((sceneId) => requirements.scenes[sceneId].sources[composition][format]),
            outputPath,
            composition,
            format,
          }))
        }
      }
      strips.push({
        sessionId: session.id,
        ordinal: session.ordinal,
        stripIndex,
        sceneSlots: sceneIds.map((sceneId, cell) => ({
          sceneId,
          cell,
          // Private review metadata: each crop keeps its own protected content
          // and caption geometry alongside the contact-sheet strip mapping.
          compositionArt: requirements.scenes[sceneId].compositionArt,
        })),
        sources,
      })
    }
  }

  await runBounded(renderTasks, STRIP_JOB_CONCURRENCY)

  return {
    schema: 'simjury.scene-art-strip-source/v1',
    caseId: requirements.caseId ?? 'cw-0001',
    sourceRevision: requirements.sourceRevision,
    grid: { columns: 2, rows: 1 },
    toolchain: { sharp: sharp.versions.sharp, vips: sharp.versions.vips },
    compositions: Object.fromEntries(COMPOSITIONS.map((composition) => {
      const tile = TILE_DIMENSIONS[composition]
      return [composition, { tile, strip: { width: tile.width * 2, height: tile.height } }]
    })),
    strips,
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const requirementsPath = argument('--requirements')
  const mediaRoot = argument('--media-root')
  const outputRoot = argument('--output-root')
  if (!requirementsPath || !mediaRoot || !outputRoot) {
    throw new Error('Usage: node scene-art-strips.mjs --requirements <json> --media-root <dir> --output-root <dir>')
  }
  const requirements = JSON.parse(readFileSync(resolve(requirementsPath), 'utf8'))
  const manifest = await buildSceneArtStrips({ requirements, mediaRoot, outputRoot })
  const manifestPath = resolve(outputRoot, 'scene-art-strips.json')
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Built ${manifest.strips.length} two-scene art strips for fully commissioned sessions.`)
}
