import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultArchiveRoot = join(resolve(siteRoot, '..'), 'archive', 'daily-v2-2026-08-03')
const EXPECTED_SOURCE_COMMIT = 'c5f0af91947a48f32b1ac3ec76b7dd9b8692ff9b'
const EXPECTED_CASES = {
  'dd-intro': 135, 'dd-0006': 167, 'dd-0017': 173, 'dd-0032': 152, 'dd-0037': 170,
  'dd-0038': 170, 'dd-0039': 163, 'dd-0040': 165, 'dd-0041': 175, 'dd-0042': 163,
}
const EXPECTED_SOURCES = Object.fromEntries(Object.keys(EXPECTED_CASES).map((caseId) => [
  caseId,
  ['dd-intro', 'dd-0006', 'dd-0017'].includes(caseId)
    ? `cases/${caseId}.json`
    : `cases/${caseId}/trial.json`,
]))
const ALL_SHARDS = Array.from({ length: 32 }, (_, index) => index)
const DD0032_KOKORO_SHARDS = ALL_SHARDS.filter((shard) => shard !== 14)

function canonicalBytes(path) {
  const bytes = readFileSync(path)
  return ['.json', '.md'].includes(extname(path).toLowerCase())
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes
}

export function stableContentHash(value) {
  let hash = 0x811c9dc5
  const content = JSON.stringify(value)
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const expandShards = (value) => value === 'all' ? ALL_SHARDS : value

export function readRuntimeProvenance(archiveRoot = defaultArchiveRoot) {
  const provenance = JSON.parse(readFileSync(join(archiveRoot, 'runtime-provenance.json'), 'utf8'))
  const archiveManifest = JSON.parse(readFileSync(join(archiveRoot, 'manifest.json'), 'utf8'))
  const sourceRecords = Object.fromEntries(Object.values(EXPECTED_SOURCES).map((source) => {
    const bytes = canonicalBytes(join(archiveRoot, source))
    return [source, { bytes, value: JSON.parse(bytes.toString('utf8')) }]
  }))
  return { provenance, archiveManifest, sourceRecords }
}

export function validateRuntimeProvenance({ provenance, archiveManifest, sourceRecords }) {
  const failures = []
  if (provenance.schema !== 'simjury.daily-docket-runtime-provenance/v1') failures.push('Runtime provenance schema is not pinned')
  if (provenance.derivation_source_commit !== EXPECTED_SOURCE_COMMIT) failures.push('Narration derivation source commit changed')
  if (JSON.stringify(provenance.release_catalog) !== JSON.stringify({
    kokoro: { tag_prefix: 'narration-kokoro', shard_count: 32 },
    scylla: { tag_prefix: 'narration-scylla', shard_count: 32 },
  })) failures.push('Narration Release catalog changed')
  if (JSON.stringify(provenance.cases.map(({ case_id }) => case_id)) !== JSON.stringify(Object.keys(EXPECTED_CASES))) {
    failures.push('Runtime provenance must cover the exact ten retired sitting IDs')
  }

  const manifestByPath = new Map(archiveManifest.files.map((file) => [file.path, file]))
  for (const record of provenance.cases) {
    if (record.source !== EXPECTED_SOURCES[record.case_id]) {
      failures.push(`Archived trial source path mismatch: ${record.case_id}`)
      continue
    }
    const source = sourceRecords[record.source]
    if (!source || source.value.id !== record.case_id) {
      failures.push(`Archived trial source mismatch: ${record.case_id}`)
      continue
    }
    const manifestEntry = manifestByPath.get(record.source)
    if (!manifestEntry) {
      failures.push(`Archived trial manifest entry missing: ${record.case_id}`)
      continue
    }
    const sourceSha = createHash('sha256').update(source.bytes).digest('hex')
    if (record.source_sha256 !== sourceSha || manifestEntry.sha256 !== sourceSha) {
      failures.push(`Archived trial SHA-256 mismatch: ${record.case_id}`)
    }
    const expectedStorageId = `${record.case_id}@${stableContentHash(source.value)}`
    if (record.case_storage_id !== expectedStorageId) failures.push(`Final caseStorageId mismatch: ${record.case_id}`)

    for (const engine of ['kokoro', 'scylla']) {
      const narration = record.narration?.[engine]
      if (narration?.clip_count !== EXPECTED_CASES[record.case_id]) {
        failures.push(`Narration clip count mismatch: ${record.case_id}/${engine}`)
      }
      const expectedShards = record.case_id === 'dd-0032' && engine === 'kokoro'
        ? DD0032_KOKORO_SHARDS
        : ALL_SHARDS
      if (JSON.stringify(expandShards(narration?.release_shards)) !== JSON.stringify(expectedShards)) {
        failures.push(`Narration Release mapping mismatch: ${record.case_id}/${engine}`)
      }
    }
  }
  return failures
}

export function auditRuntimeProvenance(archiveRoot = defaultArchiveRoot) {
  return validateRuntimeProvenance(readRuntimeProvenance(archiveRoot))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = auditRuntimeProvenance()
  if (failures.length) {
    console.error(`Archive runtime provenance failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('Archive runtime provenance passed: ten final caseStorageIds and exact Kokoro/Scylla Release mappings match archived trial sources.')
}
