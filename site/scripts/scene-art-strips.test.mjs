import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { buildSceneArtStrips, renderStripRendition } from './scene-art-strips.mjs'

const temporary = mkdtempSync(join(tmpdir(), 'simjury-art-strips-'))
const requirementsPath = join(temporary, 'requirements.json')
const outputRoot = join(temporary, 'output')
const mediaRoot = resolve('court-week-art/cw-0001')
let manifest
const staleFile = join(outputRoot, 'strips', 'day-08', 'strip-01', 'desktop.webp')

function filesBelow(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

before(async () => {
  execFileSync(process.execPath, [
    resolve('app/node_modules/tsx/dist/cli.mjs'),
    resolve('app/scripts/scene-art-requirements.ts'),
    '--output',
    requirementsPath,
  ], { stdio: 'pipe' })
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  mkdirSync(dirname(staleFile), { recursive: true })
  writeFileSync(staleFile, 'stale')
  manifest = await buildSceneArtStrips({ requirements, mediaRoot, outputRoot })
}, { timeout: 360_000 })

after(() => rmSync(temporary, { recursive: true, force: true }))

test('builds only fully commissioned session strips in legal order', () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  assert.deepEqual(manifest.grid, { columns: 2, rows: 1 })
  assert.deepEqual(manifest.toolchain, { sharp: '0.35.3', vips: sharp.versions.vips })
  assert.equal(manifest.strips.length, 28)
  assert.deepEqual([...new Set(manifest.strips.map((strip) => strip.sessionId))], [
    'cw-0001-monday',
    'cw-0001-tuesday',
    'cw-0001-wednesday',
    'cw-0001-thursday',
    'cw-0001-friday',
    'cw-0001-saturday',
    'cw-0001-sunday',
  ])
  assert.deepEqual(
    manifest.strips.flatMap((strip) => strip.sceneSlots.map((slot) => slot.sceneId)),
    requirements.sessions.flatMap((session) => session.sceneIds),
  )
  assert.deepEqual(
    manifest.strips[3].sceneSlots.map(({ sceneId, cell }) => ({ sceneId, cell })),
    [{ sceneId: 'mon-adjourn', cell: 0 }],
  )
  assert.deepEqual(
    manifest.strips.slice(-4).map((strip) => strip.sceneSlots.map(({ sceneId, cell }) => ({ sceneId, cell }))),
    [
      [{ sceneId: 'sun-resume', cell: 0 }, { sceneId: 'sun-negligence', cell: 1 }],
      [{ sceneId: 'sun-second-ballot', cell: 0 }, { sceneId: 'sun-persevere', cell: 1 }],
      [{ sceneId: 'sun-majority', cell: 0 }, { sceneId: 'sun-final-ballot', cell: 1 }],
      [{ sceneId: 'sun-verdict', cell: 0 }, { sceneId: 'sun-analysis', cell: 1 }],
    ],
  )
  assert.deepEqual(
    manifest.strips[0].sceneSlots[0].compositionArt,
    requirements.scenes['mon-arrival'].compositionArt,
  )
})

test('creates six exact-size renditions per strip and no scene for the neutral cell', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const expected = {
    portrait: { width: 1440, height: 1280 },
    tablet: { width: 2048, height: 768 },
    desktop: { width: 2560, height: 720 },
  }
  const files = filesBelow(outputRoot)
  assert.equal(files.length, 28 * 3 * 2)
  for (const strip of manifest.strips) {
    const session = manifest.strips.filter((candidate) => candidate.sessionId === strip.sessionId)
    const isLastStrip = strip.stripIndex === session.length - 1
    const hasOddSceneCount = requirements.sessions
      .find((candidate) => candidate.id === strip.sessionId).sceneIds.length % 2 === 1
    assert.equal(strip.sceneSlots.length, isLastStrip && hasOddSceneCount ? 1 : 2)
    for (const composition of ['portrait', 'tablet', 'desktop']) {
      for (const format of ['avif', 'webp']) {
        const path = resolve(outputRoot, strip.sources[composition][format])
        const metadata = await sharp(path).metadata()
        assert.deepEqual({ width: metadata.width, height: metadata.height }, expected[composition])
        assert.ok(statSync(path).size < 12_000_000)
      }
    }
  }
})

test('holds the full release projection below 500 assets', () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const completeStripCount = requirements.sessions.reduce(
    (count, session) => count + Math.ceil(session.sceneIds.length / 2),
    0,
  )
  assert.equal(completeStripCount, 28)
  const artAssets = completeStripCount * 3 * 2
  const fixedAudioAndCaptionAssets = 7 * 8 * 4
  assert.equal(artAssets, 168)
  assert.equal(artAssets + fixedAudioAndCaptionAssets + 1, 393)
})

test('rejects a duplicated or cross-session scene mapping before encoding', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  requirements.sessions[1].sceneIds[0] = requirements.sessions[0].sceneIds[0]
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'invalid') }),
    /map each of the 55 scenes exactly once/,
  )
})

test('rejects unknown session scene IDs that are absent from requirements.scenes', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  requirements.sessions[0].sceneIds[0] = 'mon-unknown-scene'
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'unknown-scene') }),
    /must match requirements\.scenes exactly/,
  )
})

test('rejects output roots that contain the reviewed source tree', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  await assert.rejects(
    buildSceneArtStrips({
      requirements,
      mediaRoot,
      outputRoot: resolve(mediaRoot, '..'),
    }),
    /disjoint from the reviewed conventional-art source root/,
  )
})

test('rejects swapped session topology even when scene IDs stay unique', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const monday = requirements.sessions[0]
  requirements.sessions[0] = requirements.sessions[1]
  requirements.sessions[1] = monday
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'swapped') }),
    /session topology mismatch/,
  )
})

test('rejects manifest-level readiness failures before encoding ready scenes', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  requirements.schema = 'foreign.schema/v1'
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'foreign') }),
    /manifest-level readiness failure/,
  )
})

test('rejects non-cw-0001 case IDs before topology encoding', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  requirements.caseId = 'foreign-case'
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'foreign-case') }),
    /locked to caseId cw-0001/,
  )
})

test('rejects unsupported rendition settings before reading source pixels', async () => {
  await assert.rejects(renderStripRendition({
    mediaRoot,
    outputRoot,
    sourcePaths: ['unused.webp'],
    outputPath: 'unused.webp',
    composition: 'phone',
    format: 'webp',
  }), /Unsupported strip rendition/)
})

test('clears stale strip output before rebuilding', async () => {
  assert.equal(existsSync(staleFile), false)
})

test('normalizes oversized art and renders deterministic bytes without a full rebuild', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const oversizedRoot = join(temporary, 'oversized-source')
  const oversizedOutput = join(temporary, 'oversized-output')
  const sourcePaths = requirements.sessions[0].sceneIds.slice(0, 2)
    .map((sceneId) => requirements.scenes[sceneId].sources.portrait.webp)
  for (const [index, relative] of sourcePaths.entries()) {
    const source = resolve(mediaRoot, relative)
    const target = join(oversizedRoot, relative)
    mkdirSync(dirname(target), { recursive: true })
    if (index === 0) {
      await sharp(source).resize(1440, 2560, { fit: 'fill' }).webp().toFile(target)
    } else copyFileSync(source, target)
  }
  await renderStripRendition({
    mediaRoot: oversizedRoot,
    outputRoot: oversizedOutput,
    sourcePaths,
    outputPath: 'portrait.webp',
    composition: 'portrait',
    format: 'webp',
  })
  await renderStripRendition({
    mediaRoot: oversizedRoot,
    outputRoot: oversizedOutput,
    sourcePaths,
    outputPath: 'portrait-copy.webp',
    composition: 'portrait',
    format: 'webp',
  })
  const firstPortrait = resolve(oversizedOutput, 'portrait.webp')
  const metadata = await sharp(firstPortrait).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 1440, height: 1280 })
  assert.deepEqual(readFileSync(firstPortrait), readFileSync(resolve(oversizedOutput, 'portrait-copy.webp')))
})
