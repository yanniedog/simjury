import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assessSceneArtManifest, readAvifDimensions, readWebpDimensions } from './scene-art-readiness.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mediaRoot = resolve(repoRoot, 'site/court-week-art/cw-0001')

test('reads dimensions from checked commissioned AVIF and WebP scene art', () => {
  const expected = {
    portrait: { width: 720, height: 1280 },
    tablet: { width: 1024, height: 768 },
    desktop: { width: 1280, height: 720 },
  }
  for (const [composition, dimensions] of Object.entries(expected)) {
    assert.deepEqual(
      readAvifDimensions(readFileSync(resolve(mediaRoot, `scenes/mon-arrival/${composition}.avif`))),
      dimensions,
    )
    assert.deepEqual(
      readWebpDimensions(readFileSync(resolve(mediaRoot, `scenes/mon-arrival/${composition}.webp`))),
      dimensions,
    )
  }
})

test('reports every incomplete scene and forbids the current generic assets', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'simjury-art-readiness-'))
  for (const composition of ['portrait', 'tablet', 'desktop']) {
    for (const format of ['avif', 'webp']) {
      const genericComposition = composition === 'desktop' ? 'wide' : composition
      const name = `courtroom-${genericComposition}.${format}`
      mkdirSync(fixtureRoot, { recursive: true })
      copyFileSync(
        resolve(mediaRoot, `scenes/mon-arrival/${composition}.${format}`),
        resolve(fixtureRoot, name),
      )
    }
  }
  const scenes = Object.fromEntries(Array.from({ length: 55 }, (_, index) => {
    const id = `scene-${String(index + 1).padStart(2, '0')}`
    return [id, {
      altDescription: `A precise alternative description for authored courtroom scene ${index + 1}.`,
      focalPoint: { x: 50, y: 50 },
      subjectSafeRegion: null,
      evidenceSafeRegion: null,
      permittedCaptionPositions: ['bottom'],
      sources: Object.fromEntries(['portrait', 'tablet', 'desktop'].map((composition) => [composition, {
        avif: `scenes/${id}/${composition}.avif`,
        webp: `scenes/${id}/${composition}.webp`,
      }])),
    }]
  }))
  try {
    const report = assessSceneArtManifest({
      schema: 'simjury.scene-art-manifest/v1',
      caseId: 'cw-0001',
      sourceRevision: 'test',
      compositionContract: {
        portrait: { aspectRatio: '9:16' }, tablet: { aspectRatio: '4:3' }, desktop: { aspectRatio: '16:9' },
      },
      scenes,
    }, fixtureRoot)

    assert.equal(report.release_ready, false)
    assert.equal(report.scene_count, 55)
    assert.equal(report.ready_scene_count, 0)
    assert.equal(report.gaps.filter((gap) => gap.code === 'missing-file').length, 55 * 6)
    assert.equal(report.gaps.filter((gap) => gap.code === 'missing-subject-safe-region').length, 55)
    assert.equal(report.gaps.filter((gap) => gap.code === 'missing-evidence-safe-region').length, 55)
    assert.equal(report.gaps.filter((gap) => gap.code === 'unreferenced-visual-asset').length, 6)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
