import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(siteRoot, '..')
const archiveRoot = join(repoRoot, 'archive', 'daily-v2-2026-08-03')
const manifestPath = join(archiveRoot, 'manifest.json')
const failures = []
const canonicalBytes = (path) => {
  const bytes = readFileSync(path)
  return ['.json', '.md'].includes(extname(path).toLowerCase())
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
    : bytes
}

if (!existsSync(manifestPath)) {
  failures.push('Daily Docket v2 archive manifest is missing')
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.schema !== 'simjury.daily-docket-archive/v1') failures.push('Archive schema is not pinned')
  if (manifest.file_count !== 230 || manifest.case_ids?.length !== 10) {
    failures.push('Archive must retain exactly 230 source/media files for ten sittings')
  }
  for (const file of manifest.files ?? []) {
    const path = resolve(archiveRoot, file.path)
    if (!path.startsWith(`${archiveRoot}\\`) && !path.startsWith(`${archiveRoot}/`)) {
      failures.push(`Archive path escapes root: ${file.path}`)
      continue
    }
    if (!existsSync(path)) {
      failures.push(`Archived file is missing: ${file.path}`)
      continue
    }
    const digest = createHash('sha256').update(canonicalBytes(path)).digest('hex')
    if (digest !== file.sha256) failures.push(`Archived hash changed: ${file.path}`)
  }
}

for (const activeRoot of [join(siteRoot, 'app', 'docket'), join(siteRoot, 'app', 'public', 'media')]) {
  if (!existsSync(activeRoot)) continue
  const retired = readdirSync(activeRoot).filter((name) => /^dd-(?:intro|\d{4})$|^dd-(?:intro|\d{4})\.json$/.test(name))
  if (retired.length) failures.push(`Retired docket content returned to ${activeRoot}: ${retired.join(', ')}`)
}

if (failures.length) {
  console.error(`Archive provenance failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Archive provenance passed: ten retired sittings and canonical media match 230 recorded SHA-256 hashes.')
