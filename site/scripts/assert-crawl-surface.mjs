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

const home = read('index.html')
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
const courtTitle = 'Eleven Minutes — SimJury Court Week'
const courtDescription = "Take a juror's seat in Eleven Minutes: five days in court, then a weekend of deliberation. An immersive audio-first fictional case; no account required."
const privacyTitle = 'Privacy — SimJury'
const privacyDescription = 'How SimJury keeps Court Week progress, notes and ballots on your device, and what static media requests reveal.'
const metadataPages = [
  ['built root', jury, 'https://simjury.com/', courtTitle, courtDescription],
  ['static root fallback', home, 'https://simjury.com/', courtTitle, courtDescription],
  ['privacy', privacy, 'https://simjury.com/privacy/', privacyTitle, privacyDescription],
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

for (const [label, source, url, title, description] of metadataPages) {
  const required = [
    [`<title>${title}</title>`, 'document title'],
    [`<meta name="description" content="${description}" />`, 'description'],
    [`<meta property="og:title" content="${title}" />`, 'Open Graph title'],
    [`<meta property="og:description" content="${description}" />`, 'Open Graph description'],
    [`<meta property="og:url" content="${url}" />`, 'Open Graph URL'],
    ['<meta property="og:type" content="website" />', 'Open Graph type'],
    ['<meta property="og:site_name" content="SimJury" />', 'Open Graph site name'],
    ['<meta property="og:locale" content="en_AU" />', 'Open Graph locale'],
    ['<meta property="og:image" content="https://simjury.com/assets/40845e3bb93922ec.webp" />', 'Open Graph image'],
    ['<meta property="og:image:width" content="1200" />', 'Open Graph image width'],
    ['<meta property="og:image:height" content="630" />', 'Open Graph image height'],
    ['<meta property="og:image:alt" content="Court sketch viewed from the jury box." />', 'Open Graph image alt'],
    ['<meta name="twitter:card" content="summary_large_image" />', 'Twitter card'],
    [`<meta name="twitter:title" content="${title}" />`, 'Twitter title'],
    [`<meta name="twitter:description" content="${description}" />`, 'Twitter description'],
    ['<meta name="twitter:image" content="https://simjury.com/assets/40845e3bb93922ec.webp" />', 'Twitter image'],
    ['<meta name="twitter:image:alt" content="Court sketch viewed from the jury box." />', 'Twitter image alt'],
    [`<link rel="canonical" href="${url}" />`, 'canonical link'],
  ]
  for (const [text, field] of required) requireText(source, text, `${label} ${field} is missing or stale`)
  if ((source.match(/rel="canonical"/gu) ?? []).length !== 1) failures.push(`${label} must expose exactly one canonical link`)
  if ((source.match(/property="og:url"/gu) ?? []).length !== 1) failures.push(`${label} must expose exactly one Open Graph URL`)
}

for (const [label, source] of [
  ['built root', jury], ['static root fallback', home], ['privacy', privacy],
  ['robots', robots], ['sitemap', sitemap], ['llms.txt', llms], ['llms-full.txt', llmsFull],
]) {
  if (/http:\/\/simjury\.com/iu.test(source)) failures.push(`${label} exposes the insecure apex origin`)
  if (/https?:\/\/www\.simjury\.com/iu.test(source)) failures.push(`${label} exposes the non-canonical www origin`)
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
for (const text of ['## Canonical public routes', '`https://simjury.com` is the sole canonical origin', '## Architecture and cost boundary', 'Cloudflare serves Static Assets only', 'The archived Daily Docket corpus is outside the public build.']) {
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
