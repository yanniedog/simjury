import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')
const failures = []

function read(relative) {
  const path = join(publicRoot, relative)
  if (!existsSync(path)) {
    failures.push(`missing crawl surface: public/${relative}`)
    return ''
  }
  return readFileSync(path, 'utf8')
}

function requireText(source, text, message) {
  if (!source.includes(text)) failures.push(message)
}

function forbidText(source, text, message) {
  if (source.toLowerCase().includes(text.toLowerCase())) failures.push(message)
}

const home = read('index.html')
const today = read(join('today', 'index.html'))
const privacy = read(join('privacy', 'index.html'))
const robots = read('robots.txt')
const sitemap = read('sitemap.xml')
const llms = read('llms.txt')
const llmsFull = read('llms-full.txt')

const expectedSitemapUrls = [
  'https://simjury.com/',
  'https://simjury.com/today/',
  'https://simjury.com/privacy/',
]
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])

if (
  sitemapUrls.length !== expectedSitemapUrls.length ||
  new Set(sitemapUrls).size !== expectedSitemapUrls.length ||
  expectedSitemapUrls.some((url) => !sitemapUrls.includes(url))
) {
  failures.push(`sitemap URLs must be exactly: ${expectedSitemapUrls.join(', ')}`)
}

const canonicalPages = [
  ['home', home, 'https://simjury.com/'],
  ['today', today, 'https://simjury.com/today/'],
  ['privacy', privacy, 'https://simjury.com/privacy/'],
]

for (const [label, html, url] of canonicalPages) {
  requireText(html, `rel="canonical" href="${url}"`, `${label} must declare its canonical URL`)
  requireText(html, 'href="/llms.txt"', `${label} must advertise the machine-readable site guide`)
  forbidText(html, 'noindex', `${label} must remain indexable`)
  requireText(sitemap, `<loc>${url}</loc>`, `sitemap must include ${url}`)
  requireText(llms, `](${url})`, `llms.txt must link ${url}`)
}

requireText(robots, 'User-agent: *', 'robots must apply to every crawler')
requireText(robots, 'Allow: /', 'robots must allow the complete public site')
requireText(robots, 'Sitemap: https://simjury.com/sitemap.xml', 'robots must advertise the sitemap')
requireText(robots, 'https://simjury.com/llms.txt', 'robots must advertise the concise AI guide')
requireText(robots, 'https://simjury.com/llms-full.txt', 'robots must advertise the complete AI guide')

requireText(today, '<div id="root">', 'built Daily Docket HTML must contain a semantic fallback')
for (const text of [
  'guided introduction',
  'seven-case library',
  'opening statements',
  'item of evidence',
  'eleven authored jurors',
  'private live-human beta room',
  'Guilty, Not Guilty, or Undecided / No verdict',
  'Any juror may remain undecided',
  'unanimous, majority, or hung-jury result',
  'spoiler-safe share card',
  'href="/privacy/"',
]) {
  requireText(today, text, `built Daily Docket fallback must describe: ${text}`)
}

for (const text of [
  '## Canonical public pages',
  'Complete machine-readable site guide',
  'seven-case library',
  'https://simjury.com/llms-full.txt',
]) {
  requireText(llms, text, `llms.txt must include: ${text}`)
}

for (const text of [
  '## Canonical public routes',
  '## Discovery and HTTP behavior',
  '## Architecture and cost boundary',
  '## Spoiler and publication boundary',
  'seven-case library',
]) {
  requireText(llmsFull, text, `llms-full.txt must include: ${text}`)
}

for (const [label, source] of [
  ['llms.txt', llms],
  ['llms-full.txt', llmsFull],
  ['Daily Docket fallback', today],
]) {
  for (const stalePromise of [
    'about ten minutes',
    '~10 minutes',
    'single-player: there are no live players or chat',
    'final Guilty or Not Guilty verdict',
    'simulations',
  ]) {
    forbidText(source, stalePromise, `${label} must not retain the stale promise: ${stalePromise}`)
  }
  for (const forbidden of [
    'verdict_truth',
    '"twist"',
    '/docket/dd-',
  ]) {
    forbidText(source, forbidden, `${label} must not expose ${forbidden}`)
  }
}

const sensitiveCaseText = new Set()
const sensitiveKeys = new Set(['reveal_note', 'reveal_stamp'])
const docketRoot = join(siteRoot, 'app', 'docket')

function addSensitive(value) {
  if (typeof value === 'string' && value.trim().length >= 4) {
    sensitiveCaseText.add(value.trim())
  }
}

function collectSensitiveKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(collectSensitiveKeys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.has(key)) addSensitive(child)
    collectSensitiveKeys(child)
  }
}

for (const file of readdirSync(docketRoot).filter((name) => name.endsWith('.json'))) {
  const docket = JSON.parse(readFileSync(join(docketRoot, file), 'utf8'))
  for (const value of [
    docket.id,
    docket.title,
    docket.hook,
    docket.twist,
    docket.epilogue,
    docket.accused?.human,
  ]) {
    addSensitive(value)
  }
  for (const castMember of docket.cast ?? []) addSensitive(castMember.name)
  collectSensitiveKeys(docket)
}

for (const [label, source] of [
  ['llms.txt', llms],
  ['llms-full.txt', llmsFull],
  ['Daily Docket fallback', today],
]) {
  const normalized = source.toLowerCase()
  for (const sensitive of sensitiveCaseText) {
    if (normalized.includes(sensitive.toLowerCase())) {
      failures.push(`${label} must not expose docket-specific text: ${sensitive}`)
    }
  }
}

if (failures.length) {
  console.error(`Crawl-surface validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log('Crawl-surface validation passed: canonical pages, raw Daily Docket fallback, robots, sitemap, and AI guides are complete and spoiler-safe.')
