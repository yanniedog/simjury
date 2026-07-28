import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')
const html = readFileSync(join(publicRoot, 'index.html'), 'utf8')
const css = readFileSync(join(publicRoot, 'landing-modern.css'), 'utf8')
const headers = readFileSync(join(publicRoot, '_headers'), 'utf8')
const failures = []

function requireText(source, text, message) {
  if (!source.includes(text)) failures.push(message)
}

function forbidText(source, text, message) {
  if (source.includes(text)) failures.push(message)
}

const localReferences = [
  ...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g),
].map((match) => match[1])

for (const reference of new Set(localReferences)) {
  const relative = reference === '/'
    ? 'index.html'
    : reference.endsWith('/')
      ? join(reference.slice(1), 'index.html')
      : reference.slice(1)
  const target = join(publicRoot, relative)
  if (!existsSync(target) || !statSync(target).isFile() || statSync(target).size === 0) {
    failures.push(`landing reference does not resolve to a built file: ${reference}`)
  }
}

requireText(html, 'One grave case · Every day', 'landing must position the docket as serious crime')
requireText(html, 'non-graphic references', 'landing must give a visible mature-content notice')
requireText(html, 'case-specific advisory', 'landing must promise a case-specific content advisory')
requireText(html, 'Progress saved locally', 'landing must describe local progress accurately')
requireText(html, 'Your progress, notes and verdict stay on this device', 'landing must explain saved-state privacy')
requireText(html, 'This is single-player: there are no live players or chat.', 'landing must distinguish scripted jurors from live players')
requireText(html, 'tabindex="-1"', 'landing main target must accept focus from the skip link')
requireText(html, '/art/daily-docket-hero.webp', 'landing must use its stable, case-independent hero asset')

const deliberateAt = html.indexOf('Deliberate from the evidence')
const lockAt = html.indexOf('Lock your verdict')
if (deliberateAt < 0 || lockAt < 0 || deliberateAt > lockAt) {
  failures.push('landing must describe deliberation before the final verdict lock')
}

forbidText(html, '/today/media/dd-', 'landing hero must not depend on replaceable docket assets')
forbidText(html, 'Private in your browser', 'landing must not overstate browser privacy')
forbidText(html, 'free and private', 'social copy must not overstate privacy')
forbidText(html, 'cloudflareinsights.com', 'landing must not embed Cloudflare analytics')
forbidText(css, '.hero-copy { order: 2; }', 'mobile landing must not place artwork before the value proposition')

requireText(headers, 'Cache-Control: no-transform', 'responses must block automatic analytics injection')
requireText(headers, "script-src 'self'", 'landing CSP must retain a self-only script policy')
requireText(headers, "connect-src 'self'", 'landing CSP must retain a self-only connection policy')
forbidText(headers, 'cloudflareinsights.com', 'CSP must not allow Cloudflare analytics')

if (failures.length) {
  console.error(`Landing-page validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`Landing-page validation passed: ${new Set(localReferences).size} local references resolve; copy, flow, privacy, mobile order, and CSP invariants hold.`)
