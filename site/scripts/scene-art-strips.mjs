import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { assessSceneArtManifest } from './scene-art-readiness.mjs'

const COMPOSITIONS = ['portrait', 'tablet', 'desktop']
const FORMATS = ['avif', 'webp']
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

function safePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) {
    throw new Error(`Unsafe art path: ${relativePath}`)
  }
  const base = resolve(root)
  const target = resolve(base, relativePath)
  if (!target.startsWith(`${base}${sep}`)) throw new Error(`Art path escapes its root: ${relativePath}`)
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
}

async function composeStrip({ mediaRoot, outputRoot, sourcePaths, outputPath, composition, format }) {
  const tile = TILE_DIMENSIONS[composition]
  const target = safePath(outputRoot, outputPath)
  mkdirSync(dirname(target), { recursive: true })
  const inputs = await Promise.all(sourcePaths.map(async (path, cell) => {
    // Readiness already enforces composition aspect ratio; resize to exact tile
    // pixels so Sharp composite accepts oversize commissioned sources without
    // inventing a second aspect contract.
    const resized = await sharp(safePath(mediaRoot, path))
      .resize(tile.width, tile.height, { fit: 'fill' })
      .toBuffer()
    return {
      input: resized,
      left: cell * tile.width,
      top: 0,
    }
  }))
  const pipeline = sharp({
    create: {
      width: tile.width * 2,
      height: tile.height,
      channels: 3,
      background: '#0d1215',
    },
  }).composite(inputs)
  if (format === 'avif') {
    await pipeline.avif({ quality: 70, effort: 4, chromaSubsampling: '4:2:0' }).toFile(target)
  } else {
    await pipeline.webp({ quality: 90, effort: 4, smartSubsample: true }).toFile(target)
  }
}

export async function buildSceneArtStrips({ requirements, mediaRoot, outputRoot }) {
  const sourceRoot = resolve(mediaRoot)
  const destination = resolve(outputRoot)
  if (sourceRoot === destination || destination.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error('Strip output must be outside the reviewed conventional-art source root.')
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
          await composeStrip({
            mediaRoot: sourceRoot,
            outputRoot: destination,
            sourcePaths: sceneIds.map((sceneId) => requirements.scenes[sceneId].sources[composition][format]),
            outputPath,
            composition,
            format,
          })
        }
      }
      strips.push({
        sessionId: session.id,
        ordinal: session.ordinal,
        stripIndex,
        sceneSlots: sceneIds.map((sceneId, cell) => ({ sceneId, cell })),
        sources,
      })
    }
  }

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
