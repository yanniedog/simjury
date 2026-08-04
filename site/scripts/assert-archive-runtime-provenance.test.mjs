import assert from 'node:assert/strict'
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
    snapshot.sourceRecords['cases/dd-0042/trial.json'].value.title = 'Changed'
    assert.match(validateRuntimeProvenance(snapshot).join('\n'), /Final caseStorageId mismatch/u)
  })
})
