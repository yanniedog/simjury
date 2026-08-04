import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { buildSceneArtStrips } from './scene-art-strips.mjs'

const temporary = mkdtempSync(join(tmpdir(), 'simjury-art-strips-'))
const requirementsPath = join(temporary, 'requirements.json')
const outputRoot = join(temporary, 'output')
const mediaRoot = resolve('court-week-art/cw-0001')
let manifest

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
  manifest = await buildSceneArtStrips({ requirements, mediaRoot, outputRoot })
}, { timeout: 90_000 })

after(() => rmSync(temporary, { recursive: true, force: true }))

test('builds only fully commissioned Monday strips in legal order', () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  assert.deepEqual(manifest.grid, { columns: 2, rows: 1 })
  assert.deepEqual(manifest.toolchain, { sharp: '0.35.3', vips: sharp.versions.vips })
  assert.equal(manifest.strips.length, 4)
  assert.deepEqual([...new Set(manifest.strips.map((strip) => strip.sessionId))], ['cw-0001-monday'])
  assert.deepEqual(
    manifest.strips.flatMap((strip) => strip.sceneSlots.map((slot) => slot.sceneId)),
    requirements.sessions[0].sceneIds,
  )
  assert.deepEqual(manifest.strips.at(-1).sceneSlots, [{ sceneId: 'mon-adjourn', cell: 0 }])
})

test('creates six exact-size renditions per strip and no scene for the neutral cell', async () => {
  const expected = {
    portrait: { width: 1440, height: 1280 },
    tablet: { width: 2048, height: 768 },
    desktop: { width: 2560, height: 720 },
  }
  const files = filesBelow(outputRoot)
  assert.equal(files.length, 4 * 3 * 2)
  for (const strip of manifest.strips) {
    assert.equal(strip.sceneSlots.length, strip.stripIndex === 3 ? 1 : 2)
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
  requirements.caseId = 'foreign-case'
  await assert.rejects(
    buildSceneArtStrips({ requirements, mediaRoot, outputRoot: join(temporary, 'foreign') }),
    /manifest-level readiness failure/,
  )
})

test('clears stale strip output before rebuilding', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const staleRoot = join(temporary, 'stale-output')
  const staleFile = join(staleRoot, 'strips', 'day-02', 'strip-01', 'desktop.webp')
  mkdirSync(dirname(staleFile), { recursive: true })
  writeFileSync(staleFile, 'stale')
  await buildSceneArtStrips({ requirements, mediaRoot, outputRoot: staleRoot })
  assert.equal(existsSync(staleFile), false)
})

test('normalizes oversized commissioned art to tile dimensions before compositing', async () => {
  const requirements = JSON.parse(readFileSync(requirementsPath, 'utf8'))
  const oversizedRoot = join(temporary, 'oversized-source')
  const oversizedOutput = join(temporary, 'oversized-output')
  mkdirSync(join(oversizedRoot, 'scenes', 'mon-arrival'), { recursive: true })
  for (const sceneId of requirements.sessions[0].sceneIds) {
    for (const composition of ['portrait', 'tablet', 'desktop']) {
      for (const format of ['avif', 'webp']) {
        const relative = requirements.scenes[sceneId].sources[composition][format]
        const source = resolve(mediaRoot, relative)
        const target = join(oversizedRoot, relative)
        mkdirSync(dirname(target), { recursive: true })
        if (sceneId === 'mon-arrival' && composition === 'portrait') {
          const tile = { width: 720, height: 1280 }
          const pipeline = sharp(source).resize(tile.width * 2, tile.height * 2, { fit: 'fill' })
          if (format === 'avif') await pipeline.avif().toFile(target)
          else await pipeline.webp().toFile(target)
        } else {
          copyFileSync(source, target)
        }
      }
    }
  }
  const rebuilt = await buildSceneArtStrips({
    requirements,
    mediaRoot: oversizedRoot,
    outputRoot: oversizedOutput,
  })
  assert.equal(rebuilt.strips.length, 4)
  const firstPortrait = resolve(oversizedOutput, rebuilt.strips[0].sources.portrait.webp)
  const metadata = await sharp(firstPortrait).metadata()
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 1440, height: 1280 })
})
