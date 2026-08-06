import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const failures = []
function read(relative) {
  const path = join(publicRoot, relative)
  if (!existsSync(path)) { failures.push(`Missing public/${relative}`); return '' }
  return readFileSync(path, 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) failures.push(message)
}
function forbidText(source, text, message) {
  if (source.toLowerCase().includes(text.toLowerCase())) failures.push(message)
}

const jury = read(join('jury', 'court-week.html'))
const privacy = read(join('privacy', 'index.html'))
const robots = read('robots.txt')
const sitemap = read('sitemap.xml')
const llms = read('llms.txt')
const llmsFull = read('llms-full.txt')
const redirects = read('_redirects')

const pages = [
  ['root', jury, 'https://simjury.com/'],
  ['privacy', privacy, 'https://simjury.com/privacy/'],
]
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
if (urls.length !== pages.length || new Set(urls).size !== pages.length) failures.push(`Sitemap must list exactly ${pages.length} canonical pages`)
for (const [label, source, url] of pages) {
  requireText(source, `rel="canonical" href="${url}"`, `${label} canonical is missing`)
  requireText(source, 'href="/llms.txt"', `${label} must advertise llms.txt`)
  requireText(sitemap, `<loc>${url}</loc>`, `${url} is missing from sitemap`)
  requireText(llms, `](${url})`, `${url} is missing from llms.txt`)
  forbidText(source, 'noindex', `${label} must remain indexable`)
}

requireText(redirects, '/ /jury/court-week 200', 'Bare-domain Court Week proxy is missing')
for (const path of ['/jury', '/jury/']) {
  requireText(redirects, `${path} / 301`, `${path} canonical redirect is missing`)
}
for (const path of ['/today', '/play', '/install']) {
  requireText(redirects, `${path} / 302`, `${path} redirect is missing`)
  requireText(redirects, `${path}/* / 302`, `${path} wildcard redirect is missing`)
}
for (const text of ['Court Week', 'five weekday court sessions', 'There is no runtime AI', 'https://simjury.com/llms-full.txt']) {
  requireText(llms, text, `llms.txt must include: ${text}`)
}
for (const text of ['## Canonical public routes', '## Architecture and cost boundary', 'Cloudflare serves Static Assets only', 'The archived Daily Docket corpus is outside the public build.']) {
  requireText(llmsFull, text, `llms-full.txt must include: ${text}`)
}
for (const source of [llms, llmsFull, jury]) {
  for (const forbidden of ['verdict_truth', '/docket/dd-', 'seven-case library', 'optional live-jury beta', '/api/waitlist']) {
    forbidText(source, forbidden, `Public crawl surface exposes retired/spoiler text: ${forbidden}`)
  }
}
requireText(robots, 'Disallow: /jury/assets/', 'Robots must exclude hashed Court Week assets')
requireText(robots, 'Sitemap: https://simjury.com/sitemap.xml', 'Robots must advertise sitemap')

if (failures.length) {
  console.error(`Crawl-surface validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('Crawl-surface validation passed: Court Week canonicals, redirects, guides and spoiler boundary are consistent.')
