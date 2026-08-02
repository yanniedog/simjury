import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
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
  const expected = readdirSync(join(siteRoot, 'app', 'docket'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()

  assert.deepEqual(scylla, kokoro)
  assert.deepEqual(scylla, expected)
  assert.ok(scylla.includes('dd-intro'))
})
