import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(siteRoot, '..')
const sourceRoot = join(siteRoot, 'app', 'public', 'media', 'court-week', 'cw-0001')
const outputRoot = join(repoRoot, '.court-week-release')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const releaseTag = argument('--release-tag')
if (!/^court-week-cw-0001-[0-9]{4}\.[0-9]{2}\.[0-9]{2}-r[1-9][0-9]*$/.test(releaseTag ?? '')) {
  throw new Error('Use --release-tag court-week-cw-0001-YYYY.MM.DD-rN')
}
if (!existsSync(sourceRoot)) throw new Error(`Missing reviewed media source: ${sourceRoot}`)

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

const allowedExtensions = new Set(['.avif', '.webp', '.opus', '.m4a', '.mp3', '.vtt'])
const sources = filesBelow(sourceRoot).sort((left, right) => left.localeCompare(right))
if (!sources.length) throw new Error('Court Week media source is empty')
if (sources.length >= 500) throw new Error(`Release has ${sources.length} assets; limit is 499 plus manifest`)

rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(outputRoot, { recursive: true })

const seenNames = new Set()
const assets = sources.map((path) => {
  const extension = extname(path).toLowerCase()
  if (!allowedExtensions.has(extension)) throw new Error(`Unsupported media type: ${path}`)
  const bytes = readFileSync(path)
  if (bytes.length > 12_000_000) throw new Error(`Asset exceeds 12 MB: ${path}`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const assetName = `${sha256}${extension}`
  if (!seenNames.has(assetName)) {
    cpSync(path, join(outputRoot, assetName))
    seenNames.add(assetName)
  }
  return {
    logical_path: relative(sourceRoot, path).split(sep).join('/'),
    asset_name: assetName,
    bytes: statSync(path).size,
    sha256,
  }
})

const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0)
if (totalBytes > 150_000_000) throw new Error(`Release is ${totalBytes} bytes; budget is 150 MB`)

const manifest = {
  schema: 'simjury.court-week-media/v1',
  case_id: 'cw-0001',
  release_tag: releaseTag,
  source_revision: process.env.GITHUB_SHA ?? 'local-unpublished',
  generated_at: process.env.GITHUB_RUN_ID ? new Date().toISOString() : null,
  asset_count: seenNames.size,
  total_bytes: totalBytes,
  assets,
}
writeFileSync(join(outputRoot, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`Prepared ${seenNames.size} content-addressed assets (${totalBytes} bytes) for ${releaseTag}.`)
