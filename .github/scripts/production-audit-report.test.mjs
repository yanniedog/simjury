import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assertDeidentified, deidentify, trackerMarker, trackerTitle } from './production-audit-report.mjs'

test('deidentifies credentials, identities, local paths, storage and URL secrets', () => {
  const safe = deidentify([
    'Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz012345',
    'Authorization: Basic YWxpY2U6c2VjcmV0',
    'Authorization: Bearer first-token second-token',
    'person@example.test from 203.0.113.42',
    'Windows trace C:\\Users\\person\\audit.log',
    'Windows trace C:\\Users\\Jane Doe\\App Data\\audit.log',
    'POSIX trace /home/Jane Doe/work/audit.log',
    'GET https://simjury.com/path?token=secret#private',
    'localStorage contained private notes and ballots',
  ].join('\n'))
  assertDeidentified(safe)
  assert.doesNotMatch(safe, /person|Jane Doe|App Data|203\.0\.113\.42|token=|ghp_/u)
  assert.doesNotMatch(safe, /YWxpY2U6c2VjcmV0|first-token|second-token/u)
  assert.match(safe, /https:\/\/simjury\.com\/path/u)
  assert.match(safe, /\[redacted-browser-storage-line\]/u)
  assert.equal((safe.match(/\[redacted-local-path-line\]/gu) ?? []).length, 3)
  assert.equal((safe.match(/\[redacted-credential-line\]/gu) ?? []).length, 3)
})

test('workflow is one-shot, non-blocking, fork-safe and publishes only redacted evidence', () => {
  const workflow = readFileSync(new URL('../workflows/production-browser-audit.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_run:/u)
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/u)
  assert.match(workflow, /head_repository\.full_name == github\.repository/u)
  assert.match(workflow, /issues: write/u)
  assert.match(workflow, /already_reported != 'true'/u)
  assert.match(workflow, /continue-on-error: true/u)
  assert.match(workflow, /paste\.rs/u)
  assert.match(workflow, /audit\.deidentified\.log/u)
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/u)
  assert.doesNotMatch(workflow, /\bschedule:|workflow_dispatch:/u)
  assert.doesNotMatch(workflow, /path: site\/app\/test-results\/production-audit\/$/mu)
})

test('deduplication trusts only GitHub Actions-authored tracker records', () => {
  const reporter = readFileSync(new URL('./production-audit-report.mjs', import.meta.url), 'utf8')
  assert.equal((reporter.match(/user\?\.login === 'github-actions\[bot\]'/gu) ?? []).length, 2)
})

test('live audit covers compact browser chrome and rejects every off-viewport control', () => {
  const audit = readFileSync(new URL('../../site/app/scripts/production-browser-audit.ts', import.meta.url), 'utf8')
  assert.match(audit, /name: 'small-phone', width: 320, height: 568/u)
  assert.match(audit, /name: 'browser-chrome-reduced', width: 360, height: 560/u)
  assert.match(audit, /box\.left >= 0 && box\.top >= 0 && box\.right <= innerWidth && box\.bottom <= innerHeight/u)
  assert.match(audit, /Actionable controls are clipped by the viewport/u)
  assert.match(audit, /\.cw-skip-link:not\(:focus\)/u)
  assert.match(audit, /layouts\.push\(await inspectLayout\(page, id, `Session \$\{ordinal\}`\)\)/u)
})

test('tracker identity is stable for idempotent issue updates', () => {
  assert.equal(trackerTitle, 'Production quality audit: simjury.com')
  assert.equal(trackerMarker, '<!-- simjury-production-audit-tracker -->')
})
