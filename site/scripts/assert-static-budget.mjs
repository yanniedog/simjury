import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
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

const retiredDocketPaths = files.filter((path) => /daily-docket/iu.test(relative(publicRoot, path)))
if (retiredDocketPaths.length) failures.push(`Retired Daily Docket asset shipped: ${retiredDocketPaths[0]}`)

for (const path of files.filter((candidate) => /^assets[\\/]/u.test(relative(publicRoot, candidate)))) {
  const declaredPrefix = /(?:^|[\\/])([a-f0-9]+)\.[a-z0-9]+$/iu.exec(path)?.[1]
  const actualDigest = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (!declaredPrefix || !actualDigest.startsWith(declaredPrefix)) {
    failures.push(`Content-addressed static asset has a stale name: ${path}`)
  }
}

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml'])
for (const path of files.filter((candidate) => textExtensions.has(extname(candidate)))) {
  if (/daily-docket/iu.test(readFileSync(path, 'utf8'))) {
    failures.push(`Retired Daily Docket production reference shipped: ${path}`)
  }
}

for (const relativePage of ['index.html', join('jury', 'court-week.html')]) {
  const pagePath = join(publicRoot, relativePage)
  if (!existsSync(pagePath)) continue
  const html = readFileSync(pagePath, 'utf8')
  const socialImages = [...html.matchAll(/<meta (?:property|name)="(?:og:image|twitter:image)" content="https:\/\/simjury\.com(\/assets\/[a-f0-9]+\.webp)" \/>/gu)]
    .map((match) => match[1])
  if (socialImages.length !== 2 || new Set(socialImages).size !== 1) {
    failures.push(`${relativePage} must expose one matching content-addressed Open Graph and Twitter image`)
    continue
  }
  if (!existsSync(join(publicRoot, socialImages[0].slice(1)))) {
    failures.push(`${relativePage} social image does not resolve: ${socialImages[0]}`)
  }
}

const juryIndex = join(publicRoot, 'jury', 'court-week.html')
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
