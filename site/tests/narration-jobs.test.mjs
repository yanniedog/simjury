import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))

function listedCases(script) {
  return JSON.parse(execFileSync(
    process.execPath,
    [`scripts/${script}`, '--case', 'all', '--list'],
    { cwd: siteRoot, encoding: 'utf8' },
  ))
}

test('both narration engines can build the varied narrator cue corpus', () => {
  const kokoro = listedCases('build-kokoro-jobs.mjs')
  const scylla = listedCases('build-scylla-jobs.mjs')

  assert.deepEqual(scylla, kokoro)
  assert.ok(scylla.includes('dd-intro'))
  assert.equal(scylla.length, 7)
})
