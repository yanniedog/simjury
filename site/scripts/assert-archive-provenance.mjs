import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultSiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultArchiveRoot = join(resolve(defaultSiteRoot, '..'), 'archive', 'daily-v2-2026-08-03')
const EXPECTED_CASE_IDS = [
  'dd-intro', 'dd-0006', 'dd-0017', 'dd-0032', 'dd-0037',
  'dd-0038', 'dd-0039', 'dd-0040', 'dd-0041', 'dd-0042',
]

const canonicalBytes = (path) => {
  const bytes = readFileSync(path)
  return ['.json', '.md'].includes(extname(path).toLowerCase())
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

export function readArchiveSnapshot(archiveRoot = defaultArchiveRoot) {
  const manifestPath = join(archiveRoot, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  const files = ['cases', 'media']
    .flatMap((root) => filesBelow(join(archiveRoot, root)))
    .sort((left, right) => left.localeCompare(right))
    .map((path) => {
      const bytes = canonicalBytes(path)
      return {
        path: relative(archiveRoot, path).split(sep).join('/'),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    })
  return {
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    checksumInventory: readFileSync(join(archiveRoot, 'manifest.sha256'), 'utf8').replace(/\r\n/g, '\n'),
    files,
  }
}

export function validateArchiveSnapshot(snapshot) {
  if (!snapshot) return ['Daily Docket v2 archive manifest is missing']
  const { manifest, checksumInventory, files } = snapshot
  const failures = []
  if (manifest.schema !== 'simjury.daily-docket-archive/v1') failures.push('Archive schema is not pinned')
  if (JSON.stringify(manifest.case_ids) !== JSON.stringify(EXPECTED_CASE_IDS)) {
    failures.push('Archive must retain the exact ten retired sitting IDs in canonical order')
  }
  if (manifest.file_count !== 230 || manifest.files?.length !== 230 || files.length !== 230) {
    failures.push('Archive must retain exactly 230 source/media files for ten sittings')
  }

  const manifestPaths = (manifest.files ?? []).map(({ path }) => path)
  const actualPaths = files.map(({ path }) => path)
  if (new Set(manifestPaths).size !== manifestPaths.length) {
    failures.push('Archive manifest contains duplicate file paths')
  }
  const missing = manifestPaths.filter((path) => !actualPaths.includes(path))
  const unlisted = actualPaths.filter((path) => !manifestPaths.includes(path))
  if (missing.length) failures.push(`Archived file is missing: ${missing.join(', ')}`)
  if (unlisted.length) failures.push(`Unlisted file exists in archive: ${unlisted.join(', ')}`)

  const actualByPath = new Map(files.map((file) => [file.path, file]))
  for (const file of manifest.files ?? []) {
    const actual = actualByPath.get(file.path)
    if (!actual) continue
    if (actual.bytes !== file.bytes) failures.push(`Archived byte count changed: ${file.path}`)
    if (actual.sha256 !== file.sha256) failures.push(`Archived hash changed: ${file.path}`)
  }
  const expectedTotal = files.reduce((sum, file) => sum + file.bytes, 0)
  if (manifest.total_bytes !== expectedTotal) failures.push('Archive total byte count changed')

  const expectedInventory = `${(manifest.files ?? [])
    .map((file) => `${file.sha256}  ${file.path}`)
    .join('\n')}\n`
  if (checksumInventory !== expectedInventory) {
    failures.push('manifest.sha256 does not exactly match the manifest file inventory')
  }
  return failures
}

export function auditArchive({ archiveRoot = defaultArchiveRoot, siteRoot = defaultSiteRoot } = {}) {
  const failures = validateArchiveSnapshot(readArchiveSnapshot(archiveRoot))
  for (const activeRoot of [join(siteRoot, 'app', 'docket'), join(siteRoot, 'app', 'public', 'media')]) {
    if (!existsSync(activeRoot)) continue
    const retired = readdirSync(activeRoot).filter((name) => /^dd-(?:intro|\d{4})$|^dd-(?:intro|\d{4})\.json$/.test(name))
    if (retired.length) failures.push(`Retired docket content returned to ${activeRoot}: ${retired.join(', ')}`)
  }
  return failures
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = auditArchive()
  if (failures.length) {
    console.error(`Archive provenance failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('Archive provenance passed: ten retired sittings and canonical media match the exact 230-file SHA-256 inventory.')
}
