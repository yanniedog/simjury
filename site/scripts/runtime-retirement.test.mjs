import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { authorizeDeletion, createVerifiedExport, quarantineStatus, recordUnbound, verifyPackage } from './runtime-retirement.mjs'

const NOW = Date.parse('2026-08-04T12:00:00.000Z')
const COMMIT = 'a'.repeat(40)
const TABLES = [
  { name: 'audit', sql: 'CREATE TABLE audit (id INTEGER PRIMARY KEY, event TEXT NOT NULL)' },
  { name: 'waitlist', sql: 'CREATE TABLE waitlist (email_key TEXT PRIMARY KEY, email TEXT NOT NULL)' },
]
const DATABASE_SQL = `${TABLES.map(({ sql }) => `${sql};`).join('\n')}
INSERT INTO audit VALUES(1, 'created');
INSERT INTO audit VALUES(2, 'unsubscribed');
INSERT INTO waitlist VALUES('person@example.invalid', 'person@example.invalid');
`

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), 'simjury-retirement-'))
}

function mockWrangler(args) {
  if (args[1] === 'execute') {
    const sql = args.find((arg) => arg.startsWith('--command='))?.slice('--command='.length)
    if (sql.includes('sqlite_schema')) return JSON.stringify([{ success: true, results: TABLES }])
    if (sql.includes('"audit"')) return JSON.stringify([{ success: true, results: [{ rows: 2 }] }])
    if (sql.includes('"waitlist"')) return JSON.stringify([{ success: true, results: [{ rows: 1 }] }])
  }
  if (args[1] === 'export') {
    const output = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length)
    writeFileSync(output, DATABASE_SQL)
    return ''
  }
  throw new Error(`Unexpected mocked Wrangler arguments: ${args.join(' ')}`)
}

test('creates a verified all-table export and detects later tampering', () => {
  const directory = temporaryDirectory()
  try {
    const created = createVerifiedExport({
      destination: directory,
      encryptedAttestation: 'ENCRYPTED_AND_OPERATOR_CONTROLLED',
      roomsDisabledAt: '2026-08-04T09:00:00.000Z',
      now: NOW,
      runWrangler: mockWrangler,
    })
    assert.deepEqual(created.receipt.tables.map(({ name, rows }) => ({ name, rows })), [
      { name: 'audit', rows: 2 },
      { name: 'waitlist', rows: 1 },
    ])
    assert.equal(created.receipt.artifacts.length, 3)
    assert.equal(verifyPackage(directory).receiptHash.length, 64)
    const dump = join(directory, 'database.sql')
    writeFileSync(dump, `${readFileSync(dump, 'utf8')}-- changed\n`)
    assert.throws(() => verifyPackage(directory), /artifact changed/u)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('requires the safe destination and drain attestations before any Wrangler call', () => {
  const directory = temporaryDirectory()
  let calls = 0
  const runner = () => { calls += 1; return '' }
  try {
    assert.throws(() => createVerifiedExport({ destination: 'relative', encryptedAttestation: 'ENCRYPTED_AND_OPERATOR_CONTROLLED', roomsDisabledAt: '2026-08-04T09:00:00Z', now: NOW, runWrangler: runner }), /absolute/u)
    assert.throws(() => createVerifiedExport({ destination: directory, encryptedAttestation: 'no', roomsDisabledAt: '2026-08-04T09:00:00Z', now: NOW, runWrangler: runner }), /confirm-encrypted/u)
    assert.throws(() => createVerifiedExport({ destination: directory, encryptedAttestation: 'ENCRYPTED_AND_OPERATOR_CONTROLLED', roomsDisabledAt: '2026-08-04T11:00:01Z', now: NOW, runWrangler: runner }), /at least 2 hours/u)
    assert.throws(() => createVerifiedExport({ destination: resolve('.'), encryptedAttestation: 'ENCRYPTED_AND_OPERATOR_CONTROLLED', roomsDisabledAt: '2026-08-04T09:00:00Z', now: NOW, runWrangler: runner }), /outside the repository/u)
    assert.equal(calls, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('enforces verified unbinding, quarantine and separate deletion authorization', () => {
  const directory = temporaryDirectory()
  try {
    createVerifiedExport({ destination: directory, encryptedAttestation: 'ENCRYPTED_AND_OPERATOR_CONTROLLED', roomsDisabledAt: '2026-08-04T09:00:00Z', now: NOW, runWrangler: mockWrangler })
    assert.throws(() => recordUnbound({ packageDirectory: directory, staticAttestation: 'wrong', deploymentCommit: COMMIT, now: NOW }), /confirm-static/u)
    const quarantine = recordUnbound({ packageDirectory: directory, staticAttestation: 'STATIC_ASSETS_ONLY_DEPLOYED', deploymentCommit: COMMIT, now: NOW })
    assert.deepEqual(recordUnbound({ packageDirectory: directory, staticAttestation: 'STATIC_ASSETS_ONLY_DEPLOYED', deploymentCommit: COMMIT, now: NOW + 1 }), quarantine)
    const quarantinePath = join(directory, 'quarantine.json')
    const quarantineBytes = readFileSync(quarantinePath)
    writeFileSync(quarantinePath, `${quarantineBytes}\n`)
    assert.throws(() => quarantineStatus(directory, NOW), /quarantine receipt hash mismatch/u)
    writeFileSync(quarantinePath, quarantineBytes)
    assert.equal(quarantineStatus(directory, NOW + 29 * 86_400_000).complete, false)
    assert.throws(() => authorizeDeletion({ packageDirectory: directory, authorizationReference: 'private-log-42', deletionAttestation: 'OWNER_AUTHORIZED_SEPARATE_DELETION', now: NOW + 29 * 86_400_000 }), /not complete/u)
    const authorization = authorizeDeletion({ packageDirectory: directory, authorizationReference: 'private-log-42', deletionAttestation: 'OWNER_AUTHORIZED_SEPARATE_DELETION', now: NOW + 30 * 86_400_000 })
    assert.equal(authorization.performs_deletion, false)
    assert.deepEqual(authorizeDeletion({ packageDirectory: directory, authorizationReference: 'private-log-42', deletionAttestation: 'OWNER_AUTHORIZED_SEPARATE_DELETION', now: NOW + 31 * 86_400_000 }), authorization)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
