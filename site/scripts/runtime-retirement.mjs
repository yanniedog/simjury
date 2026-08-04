import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const SITE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const REPO_ROOT = resolve(SITE_ROOT, '..')
const DATABASE = 'simjury-waitlist'
const ENCRYPTED_ATTESTATION = 'ENCRYPTED_AND_OPERATOR_CONTROLLED'
const STATIC_ATTESTATION = 'STATIC_ASSETS_ONLY_DEPLOYED'
const DELETION_ATTESTATION = 'OWNER_AUTHORIZED_SEPARATE_DELETION'
const QUARANTINE_MS = 30 * 24 * 60 * 60 * 1_000
const ROOM_DRAIN_MS = 2 * 60 * 60 * 1_000
const TABLE_SQL = "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const quoteIdentifier = (name) => `"${name.replaceAll('"', '""')}"`
const normalizeSql = (sql) => sql.trim().replace(/\s+/gu, ' ').replace(/^CREATE TABLE IF NOT EXISTS /iu, 'CREATE TABLE ')
const inside = (child, parent) => {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function requireExternalDirectory(input, { empty = false } = {}) {
  if (!input || !isAbsolute(input)) throw new Error('Destination/package path must be absolute.')
  if (!existsSync(input) || !lstatSync(input).isDirectory() || lstatSync(input).isSymbolicLink()) {
    throw new Error('Destination/package must be an existing non-symlink directory.')
  }
  const actual = realpathSync(input)
  if (inside(actual, realpathSync(REPO_ROOT))) throw new Error('Destination/package must be outside the repository.')
  if (empty && readdirSync(actual).length) throw new Error('Export destination must be empty; refusing to overwrite files.')
  return actual
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error(`Invalid option: ${rest[index] ?? 'missing'}.`)
    options[rest[index].slice(2)] = rest[index + 1]
  }
  return { command, options }
}

function requireAge(timestamp, milliseconds, now) {
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed) || parsed > now || now - parsed < milliseconds) {
    throw new Error(`Live-room intake must have been disabled for at least ${milliseconds / 3_600_000} hours.`)
  }
  return new Date(parsed).toISOString()
}

function extractResults(stdout) {
  const payload = JSON.parse(stdout)
  const batches = Array.isArray(payload) ? payload : [payload]
  if (!batches.length || batches.some((batch) => batch?.success === false || !Array.isArray(batch?.results))) {
    throw new Error('Wrangler returned an unsuccessful or unsupported D1 JSON response.')
  }
  return batches.flatMap((batch) => batch.results)
}

function defaultWrangler(args) {
  const executable = join(SITE_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')
  if (!existsSync(executable)) throw new Error('Install exact site dependencies before running the retirement command.')
  const result = spawnSync(executable, args, { cwd: SITE_ROOT, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error(`Wrangler failed with exit code ${result.status}; no output was retained.`)
  return result.stdout
}

function queryRemote(sql, runWrangler) {
  return extractResults(runWrangler(['d1', 'execute', DATABASE, '--remote', '--json', `--command=${sql}`]))
}

function exportRemote(output, runWrangler) {
  runWrangler(['d1', 'export', DATABASE, '--remote', `--output=${output}`])
}

function restoredRecord(sqlPath) {
  const temporary = join(resolve(sqlPath, '..'), `.verify-${process.pid}-${Date.now()}.sqlite`)
  const database = new DatabaseSync(temporary)
  try {
    database.exec(readFileSync(sqlPath, 'utf8'))
    const integrity = database.prepare('PRAGMA integrity_check').get()?.integrity_check
    if (integrity !== 'ok') throw new Error(`Restored export integrity check failed: ${integrity ?? 'missing'}.`)
    return database.prepare(TABLE_SQL).all().map(({ name, sql }) => ({
      name,
      sql: normalizeSql(sql),
      rows: Number(database.prepare(`SELECT COUNT(*) AS rows FROM ${quoteIdentifier(name)}`).get().rows),
    }))
  } finally {
    database.close()
    rmSync(temporary, { force: true })
  }
}

function writePrivate(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function artifactRecord(directory, name) {
  const bytes = readFileSync(join(directory, name))
  return { name, bytes: bytes.length, sha256: sha256(bytes) }
}

function writeHashedJson(directory, stem, value) {
  writePrivate(join(directory, `${stem}.json`), value)
  writePrivate(join(directory, `${stem}.sha256`), `${artifactRecord(directory, `${stem}.json`).sha256}\n`)
}

function readHashedJson(directory, stem) {
  const bytes = readFileSync(join(directory, `${stem}.json`))
  const expectedHash = readFileSync(join(directory, `${stem}.sha256`), 'utf8').trim()
  if (sha256(bytes) !== expectedHash) throw new Error(`${stem} receipt hash mismatch.`)
  return { value: JSON.parse(bytes), hash: expectedHash }
}

export function verifyPackage(packageDirectory) {
  const directory = requireExternalDirectory(packageDirectory)
  const { value: receipt, hash: expectedReceiptHash } = readHashedJson(directory, 'verification')
  if (receipt.database !== DATABASE || receipt.status !== 'verified_for_unbinding') throw new Error('Unsupported retirement receipt.')
  for (const artifact of receipt.artifacts) {
    const actual = artifactRecord(directory, artifact.name)
    if (actual.bytes !== artifact.bytes || actual.sha256 !== artifact.sha256) throw new Error(`Retirement artifact changed: ${artifact.name}.`)
  }
  const restored = restoredRecord(join(directory, 'database.sql'))
  if (JSON.stringify(restored) !== JSON.stringify(receipt.tables)) throw new Error('Restored schema or row counts no longer match the verified receipt.')
  return { directory, receipt, receiptHash: expectedReceiptHash }
}

export function createVerifiedExport({ destination, encryptedAttestation, roomsDisabledAt, now = Date.now(), runWrangler = defaultWrangler }) {
  if (encryptedAttestation !== ENCRYPTED_ATTESTATION) throw new Error(`Pass --confirm-encrypted ${ENCRYPTED_ATTESTATION}.`)
  const directory = requireExternalDirectory(destination, { empty: true })
  const drainedAt = requireAge(roomsDisabledAt, ROOM_DRAIN_MS, now)
  const remoteTables = queryRemote(TABLE_SQL, runWrangler).map(({ name, sql }) => ({ name, sql: normalizeSql(sql) }))
  if (!remoteTables.length) throw new Error('No application tables were returned; refusing an empty export.')
  const remoteCounts = remoteTables.map(({ name }) => {
    const [row] = queryRemote(`SELECT COUNT(*) AS rows FROM ${quoteIdentifier(name)}`, runWrangler)
    return { name, rows: Number(row?.rows) }
  })
  writePrivate(join(directory, 'schema.json'), { database: DATABASE, tables: remoteTables })
  writePrivate(join(directory, 'row-counts.json'), { database: DATABASE, tables: remoteCounts })
  exportRemote(join(directory, 'database.sql'), runWrangler)
  const restored = restoredRecord(join(directory, 'database.sql'))
  const expected = remoteTables.map((table) => ({ ...table, rows: remoteCounts.find(({ name }) => name === table.name)?.rows }))
  if (JSON.stringify(restored) !== JSON.stringify(expected)) throw new Error('Restored export does not match remote schema and table counts.')
  const artifacts = ['schema.json', 'row-counts.json', 'database.sql'].map((name) => artifactRecord(directory, name))
  const receipt = { schema: 'simjury.runtime-retirement/v1', database: DATABASE, status: 'verified_for_unbinding', verified_at: new Date(now).toISOString(), rooms_disabled_at: drainedAt, quarantine_days: 30, tables: restored, artifacts }
  writeHashedJson(directory, 'verification', receipt)
  return verifyPackage(directory)
}

export function recordUnbound({ packageDirectory, staticAttestation, deploymentCommit, now = Date.now() }) {
  if (staticAttestation !== STATIC_ATTESTATION) throw new Error(`Pass --confirm-static ${STATIC_ATTESTATION}.`)
  if (!/^[0-9a-f]{40}$/u.test(deploymentCommit ?? '')) throw new Error('Deployment commit must be a full lowercase Git SHA.')
  const verified = verifyPackage(packageDirectory)
  const path = join(verified.directory, 'quarantine.json')
  if (now < Date.parse(verified.receipt.verified_at)) throw new Error('Unbinding time cannot precede export verification.')
  if (existsSync(path)) {
    const existing = readHashedJson(verified.directory, 'quarantine').value
    if (existing.deployment_commit !== deploymentCommit || existing.verification_sha256 !== verified.receiptHash) throw new Error('Existing quarantine receipt does not match this operation.')
    return existing
  }
  writeHashedJson(verified.directory, 'quarantine', { schema: 'simjury.runtime-quarantine/v1', unbound_at: new Date(now).toISOString(), quarantine_ends_at: new Date(now + QUARANTINE_MS).toISOString(), deployment_commit: deploymentCommit, verification_sha256: verified.receiptHash, deletion_authorized: false })
  return readHashedJson(verified.directory, 'quarantine').value
}

export function quarantineStatus(packageDirectory, now = Date.now()) {
  const verified = verifyPackage(packageDirectory)
  const quarantine = readHashedJson(verified.directory, 'quarantine').value
  if (quarantine.verification_sha256 !== verified.receiptHash) throw new Error('Quarantine record is not bound to this verified export.')
  const remainingMs = Date.parse(quarantine.quarantine_ends_at) - now
  return { ...quarantine, complete: remainingMs <= 0, remaining_ms: Math.max(0, remainingMs) }
}

export function authorizeDeletion({ packageDirectory, authorizationReference, deletionAttestation, now = Date.now() }) {
  if (deletionAttestation !== DELETION_ATTESTATION) throw new Error(`Pass --confirm-deletion ${DELETION_ATTESTATION}.`)
  if (!authorizationReference?.trim()) throw new Error('A private owner-authorization reference is required.')
  const status = quarantineStatus(packageDirectory, now)
  if (!status.complete) throw new Error('Thirty-day quarantine is not complete; deletion remains prohibited.')
  const directory = requireExternalDirectory(packageDirectory)
  const path = join(directory, 'deletion-authorization.json')
  if (existsSync(path)) {
    const existing = readHashedJson(directory, 'deletion-authorization').value
    if (existing.authorization_reference !== authorizationReference.trim()) throw new Error('Existing deletion authorization has a different owner reference.')
    return existing
  }
  const record = { schema: 'simjury.runtime-deletion-authorization/v1', authorized_at: new Date(now).toISOString(), authorization_reference: authorizationReference.trim(), quarantine_ends_at: status.quarantine_ends_at, performs_deletion: false }
  writeHashedJson(directory, 'deletion-authorization', record)
  return record
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  let result
  if (command === 'export') result = createVerifiedExport({ destination: options.destination, encryptedAttestation: options['confirm-encrypted'], roomsDisabledAt: options['rooms-disabled-at'] })
  else if (command === 'verify') result = verifyPackage(options.package)
  else if (command === 'record-unbound') result = recordUnbound({ packageDirectory: options.package, staticAttestation: options['confirm-static'], deploymentCommit: options['deployment-commit'] })
  else if (command === 'quarantine-status') result = quarantineStatus(options.package)
  else if (command === 'authorize-deletion') result = authorizeDeletion({ packageDirectory: options.package, authorizationReference: options['authorization-reference'], deletionAttestation: options['confirm-deletion'] })
  else throw new Error('Command must be export, verify, record-unbound, quarantine-status or authorize-deletion.')
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`runtime-retirement: ${error.message}`); process.exitCode = 1 }
}
