import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')
const failures = []

function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

const files = filesBelow(publicRoot)
const totalBytes = files.reduce((sum, path) => sum + statSync(path).size, 0)
if (files.length > 200) failures.push(`Static deployment has ${files.length} files; budget is 200`)
if (totalBytes > 5_000_000) failures.push(`Static deployment is ${totalBytes} bytes; budget is 5,000,000`)

for (const forbidden of ['api', 'discord', 'docket', 'archive']) {
  if (existsSync(join(publicRoot, forbidden))) failures.push(`Forbidden shipped directory: public/${forbidden}`)
}
const retiredMedia = files.filter((path) => /[\\/]media[\\/]dd-(?:intro|\d{4})[\\/]/.test(path))
if (retiredMedia.length) failures.push(`Retired docket media shipped: ${retiredMedia[0]}`)

const juryIndex = join(publicRoot, 'jury', 'index.html')
if (existsSync(juryIndex)) {
  const html = readFileSync(juryIndex, 'utf8')
  const initialPaths = [...html.matchAll(/(?:src|href)="(\/jury\/[^"?#]+)"/g)]
    .map((match) => join(publicRoot, match[1].slice(1)))
    .filter(existsSync)
  const initialBytes = statSync(juryIndex).size
    + [...new Set(initialPaths)].reduce((sum, path) => sum + statSync(path).size, 0)
  if (initialBytes > 2_000_000) failures.push(`Initial Court Week transfer is ${initialBytes} bytes; budget is 2,000,000`)
}

if (failures.length) {
  console.error(`Static budget failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`Static budget passed: ${files.length} files, ${totalBytes} bytes; no archive or retired docket media shipped.`)
