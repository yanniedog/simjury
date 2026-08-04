import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  readRuntimeProvenance,
  validateRuntimeProvenance,
} from './assert-archive-runtime-provenance.mjs'

const archiveRoot = fileURLToPath(new URL('../../archive/daily-v2-2026-08-03/', import.meta.url))
const baseline = readRuntimeProvenance(archiveRoot)
const copy = () => structuredClone(baseline)

describe('retired Daily Docket runtime provenance', () => {
  it('reconstructs every final caseStorageId from the archived trial source', () => {
    assert.deepEqual(validateRuntimeProvenance(copy()), [])
  })

  it('rejects a stale runtime revision', () => {
    const snapshot = copy()
    snapshot.provenance.cases[0].case_storage_id = 'dd-intro@00000000'
    assert.match(validateRuntimeProvenance(snapshot).join('\n'), /Final caseStorageId mismatch/u)
  })

  it('rejects an incomplete narration Release mapping', () => {
    const snapshot = copy()
    snapshot.provenance.cases[0].narration.kokoro.release_shards = [0, 1]
    assert.match(validateRuntimeProvenance(snapshot).join('\n'), /Narration Release mapping mismatch/u)
  })

  it('rejects a trial source that no longer matches archive provenance', () => {
    const snapshot = copy()
    const source = snapshot.sourceRecords['cases/dd-0042/trial.json']
    source.value = { ...source.value, title: 'Changed' }
    source.bytes = Buffer.from(JSON.stringify(source.value), 'utf8')
    assert.match(validateRuntimeProvenance(snapshot).join('\n'), /Archived trial SHA-256 mismatch/u)
  })

  it('identifies a missing trial entry in the archive manifest', () => {
    const snapshot = copy()
    snapshot.archiveManifest.files = snapshot.archiveManifest.files.filter(
      ({ path }) => path !== 'cases/dd-intro.json',
    )
    assert.ok(validateRuntimeProvenance(snapshot).includes(
      'Archived trial manifest entry missing: dd-intro',
    ))
  })

  it('runs the archive audit in the required validate workflow', () => {
    const workflow = readFileSync(fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)), 'utf8')
    assert.match(workflow, /name: Audit retired Daily Docket archive provenance[\s\S]*?run: npm run check:archive/u)
  })
})
