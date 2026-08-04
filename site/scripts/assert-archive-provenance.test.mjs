import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  readArchiveSnapshot,
  validateArchiveSnapshot,
} from './assert-archive-provenance.mjs'

const archiveRoot = fileURLToPath(new URL('../../archive/daily-v2-2026-08-03/', import.meta.url))
const baseline = readArchiveSnapshot(archiveRoot)
const copy = () => structuredClone(baseline)

describe('Daily Docket archive provenance', () => {
  it('accepts the exact checked-in archive and checksum inventory', () => {
    assert.deepEqual(validateArchiveSnapshot(copy()), [])
  })

  it('rejects an unlisted file even when every manifested file is intact', () => {
    const snapshot = copy()
    snapshot.files.push({ path: 'cases/unlisted.json', bytes: 3, sha256: '0'.repeat(64) })
    assert.match(validateArchiveSnapshot(snapshot).join('\n'), /Unlisted file exists in archive/u)
  })

  it('identifies each independent file-count drift', () => {
    const manifestCount = copy()
    manifestCount.manifest.file_count = 229
    assert.ok(validateArchiveSnapshot(manifestCount).includes(
      'Archive file count mismatch: manifest.file_count=229, expected=230',
    ))

    const manifestFiles = copy()
    manifestFiles.manifest.files.pop()
    assert.ok(validateArchiveSnapshot(manifestFiles).includes(
      'Archive file count mismatch: manifest.files.length=229, expected=230',
    ))

    const snapshotFiles = copy()
    snapshotFiles.files.pop()
    assert.ok(validateArchiveSnapshot(snapshotFiles).includes(
      'Archive file count mismatch: snapshot.files.length=229, expected=230',
    ))
  })

  it('rejects swapped or missing retired sitting IDs', async (t) => {
    await t.test('swapped ID', () => {
      const snapshot = copy()
      snapshot.manifest.case_ids[9] = 'dd-9999'
      assert.match(validateArchiveSnapshot(snapshot).join('\n'), /exact ten retired sitting IDs/u)
    })
    await t.test('missing ID', () => {
      const snapshot = copy()
      snapshot.manifest.case_ids.pop()
      assert.match(validateArchiveSnapshot(snapshot).join('\n'), /exact ten retired sitting IDs/u)
    })
  })

  it('rejects corrupt or truncated manifest.sha256 inventories', async (t) => {
    await t.test('corrupt hash', () => {
      const snapshot = copy()
      snapshot.checksumInventory = snapshot.checksumInventory.replace(
        /[0-9a-f]/u,
        (character) => character === 'f' ? 'e' : 'f',
      )
      assert.match(validateArchiveSnapshot(snapshot).join('\n'), /manifest\.sha256 does not exactly match/u)
    })
    await t.test('truncated inventory', () => {
      const snapshot = copy()
      snapshot.checksumInventory = snapshot.checksumInventory.split('\n').slice(0, -2).join('\n') + '\n'
      assert.match(validateArchiveSnapshot(snapshot).join('\n'), /manifest\.sha256 does not exactly match/u)
    })
  })
})
