import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')
const home = readFileSync(join(publicRoot, 'index.html'), 'utf8')
const privacy = readFileSync(join(publicRoot, 'privacy', 'index.html'), 'utf8')
const ready = readFileSync(join(publicRoot, 'ready.js'), 'utf8')
const headers = readFileSync(join(publicRoot, '_headers'), 'utf8')
const failures = []
const courtSketchPath = '/assets/40845e3bb93922ec.webp'

function requireText(source, text, message) {
  if (!source.includes(text)) failures.push(message)
}
function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) failures.push(message)
}
function forbidText(source, text, message) {
  if (source.toLowerCase().includes(text.toLowerCase())) failures.push(message)
}

const references = [...home.matchAll(/(?:href|src)="(\/[^"#?]*)"/g), ...privacy.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== '/jury/')
for (const reference of new Set(references)) {
  const relative = reference === '/' ? 'index.html' : reference.endsWith('/')
    ? join(reference.slice(1), 'index.html') : reference.slice(1)
  const target = join(publicRoot, relative)
  if (!existsSync(target) || !statSync(target).isFile() || statSync(target).size === 0) {
    failures.push(`Landing reference does not resolve: ${reference}`)
  }
}

for (const text of [
  'One grave case · Seven sessions',
  'About 20 minutes a day',
  'Progress saved locally',
  'Eleven Minutes',
  'five trial days',
  'eleven authored jurors',
  'Murder, manslaughter, Not Guilty',
  'href="/jury/"',
  'Everything in SimJury is fictional',
  'adults aged 18 and over',
]) requireText(home, text, `Landing must include: ${text}`)

for (const text of [
  'optional live-jury', '/api/waitlist', 'Join the waitlist', 'Every day',
  'invited people', 'Today’s case', 'cloudflareinsights.com',
]) forbidText(home, text, `Landing must not retain retired copy/surface: ${text}`)

for (const text of [
  'no player accounts, analytics or backend player-state service',
  'private notes, provisional ballot, final ballot',
  'explicitly export a versioned progress file',
  'GitHub and its release-asset delivery service',
  'Cloudflare Static Assets',
  'There is no SimJury Worker, D1 database, Durable Object or gameplay API.',
  'There is no runtime generative AI, multiplayer room, chat, email waitlist or account.',
]) requireText(privacy, text, `Privacy page must include: ${text}`)

requireText(ready, 'simjury:fiction-disclosure:v2', 'Landing must retain the versioned adult-fiction gate')
requireText(headers, 'Cache-Control: no-transform', 'Static responses must block transformations')
const cacheRules = [
  ['/jury/\\*', 'Cache-Control:\\s*no-store, no-cache, must-revalidate, no-transform', 'Court Week shell'],
  ['/jury/assets/\\*', '! Cache-Control\\r?\\n\\s+Cache-Control:\\s*public, max-age=31536000, immutable, no-transform', 'Court Week hashed assets'],
  ['/jury/court-week/packs/\\*', '! Cache-Control\\r?\\n\\s+Cache-Control:\\s*public, max-age=31536000, immutable, no-transform', 'Court Week sealed packs'],
]
for (const [route, directive, label] of cacheRules) {
  requireMatch(headers, new RegExp(`^${route}\\r?\\n\\s+${directive}$`, 'm'),
    `${label} cache rule must survive deploy transitions`)
}
requireText(headers, '/assets/*', 'Content-addressed landing assets must have a dedicated cache rule')
requireText(headers, 'Cache-Control: public, max-age=31536000, immutable, no-transform', 'Content-addressed landing assets must be immutable')
requireText(headers, "script-src 'self'", 'CSP must keep scripts self-only')
requireText(headers, "connect-src 'self'", 'CSP must keep connections self-only')
requireText(home, `content="https://simjury.com${courtSketchPath}"`, 'Landing social metadata must use the content-addressed court sketch')
if (!existsSync(join(publicRoot, courtSketchPath.slice(1)))) failures.push('Content-addressed landing court sketch is missing')

if (failures.length) {
  console.error(`Landing validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`Landing validation passed: Court Week copy, local-state privacy and ${new Set(references).size} static references are consistent.`)
