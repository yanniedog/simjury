import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(siteRoot, '..')
const archiveRoot = join(repoRoot, 'archive', 'daily-v2-2026-08-03')
const roots = ['cases', 'media']

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? filesBelow(path) : [path]
    })
}

const files = roots.flatMap((name) => filesBelow(join(archiveRoot, name)))
  .sort((left, right) => left.localeCompare(right))
  .map((path) => {
    const bytes = readFileSync(path)
    return {
      path: relative(archiveRoot, path).split(sep).join('/'),
      bytes: statSync(path).size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  })

const caseIds = [
  'dd-intro', 'dd-0006', 'dd-0017', 'dd-0032', 'dd-0037',
  'dd-0038', 'dd-0039', 'dd-0040', 'dd-0041', 'dd-0042',
]
const manifest = {
  schema: 'simjury.daily-docket-archive/v1',
  archived_on: '2026-08-03',
  reason: 'Owner-directed replacement of Daily Docket by one seven-session Court Week case.',
  active_authority: 'COURT-WEEK.md',
  former_canonical_route: '/today/',
  compatibility_redirect: '/jury/',
  case_ids: caseIds,
  original_roots: ['site/app/docket', 'site/app/public/media'],
  narration_releases: [
    { engine: 'kokoro', tag_pattern: 'narration-kokoro-{0..31}', preserved: true },
    { engine: 'scylla', tag_pattern: 'narration-scylla-{0..31}', preserved: true },
  ],
  known_legal_defects: [
    'final-directions-before-closings',
    'interrupted-crown-case-in-dd-0038-and-dd-0039',
    'uniform-objection-timing-and-outcomes',
    'missing-reexamination',
    'missing-first-ballot-and-jury-note',
    'verdict-not-returned-in-open-court',
    'majority-procedure-not-delayed',
    'improper-deliberation-arguments-have-no-negative-effect',
  ],
  file_count: files.length,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
}

writeFileSync(
  join(archiveRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
)
writeFileSync(
  join(archiveRoot, 'manifest.sha256'),
  `${files.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`,
  'utf8',
)

console.log(`Archived ${files.length} files (${manifest.total_bytes} bytes).`)
