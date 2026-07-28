import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = join(siteRoot, 'public')
const html = readFileSync(join(publicRoot, 'index.html'), 'utf8')
const privacyHtml = readFileSync(join(publicRoot, 'privacy', 'index.html'), 'utf8')
const css = readFileSync(join(publicRoot, 'landing-modern.css'), 'utf8')
const headers = readFileSync(join(publicRoot, '_headers'), 'utf8')
const sitemap = readFileSync(join(publicRoot, 'sitemap.xml'), 'utf8')
const failures = []

function requireText(source, text, message) {
  if (!source.includes(text)) failures.push(message)
}

function forbidText(source, text, message) {
  if (source.includes(text)) failures.push(message)
}

const localReferences = [
  ...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g),
  ...privacyHtml.matchAll(/(?:href|src)="(\/[^"#?]*)"/g),
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
requireText(html, 'href="/privacy/"', 'landing footer must link to the privacy page')
requireText(html, 'This is single-player: there are no live players or chat.', 'landing must distinguish scripted jurors from live players')
requireText(html, 'tabindex="-1"', 'landing main target must accept focus from the skip link')
requireText(html, '/daily-docket-cover.webp', 'landing must use the stable case-independent hero asset')

const deliberateAt = html.indexOf('Deliberate from the evidence')
const lockAt = html.indexOf('Lock your verdict')
if (deliberateAt < 0 || lockAt < 0 || deliberateAt > lockAt) {
  failures.push('landing must describe deliberation before the final verdict lock')
}

forbidText(html, '/today/media/dd-', 'landing hero must not depend on replaceable docket case assets')
forbidText(html, 'Private in your browser', 'landing must not overstate browser privacy')
forbidText(html, 'free and private', 'social copy must not overstate privacy')
forbidText(html, 'cloudflareinsights.com', 'landing must not embed Cloudflare analytics')
forbidText(css, '.hero-copy { order: 2; }', 'mobile landing must not place artwork before the value proposition')

requireText(privacyHtml, 'no player accounts or backend player-state service', 'privacy page must explain the absence of accounts and backend player state')
requireText(privacyHtml, 'progress, notes, verdict, narration preferences and sitting statistics', 'privacy page must enumerate browser-stored player data')
requireText(privacyHtml, 'There is no cross-device or cross-browser sync.', 'privacy page must explain that saved state does not sync')
requireText(privacyHtml, 'clearing SimJury site data removes your access', 'privacy page must explain the effect of clearing browser data')
requireText(privacyHtml, 'GitHub can observe request metadata, request timing and the requested clip IDs.', 'privacy page must disclose narration request visibility')
requireText(privacyHtml, 'Those requests do not contain your saved progress, notes, verdict or statistics.', 'privacy page must distinguish media requests from saved state')
requireText(privacyHtml, 'Static pages and assets are served through Cloudflare.', 'privacy page must disclose the static delivery provider')
requireText(privacyHtml, 'Cloudflare receives ordinary HTTP request metadata needed to deliver them.', 'privacy page must disclose ordinary CDN request visibility')
requireText(privacyHtml, 'does not add analytics or tracking code', 'privacy page must state the analytics and tracking posture')
requireText(privacyHtml, 'does not attach your locally saved progress, notes or verdicts to those requests.', 'privacy page must separate static delivery requests from saved player state')
requireText(privacyHtml, 'Daily cases are fictional and pre-authored.', 'privacy page must describe case authorship accurately')
requireText(privacyHtml, 'produced deterministically in your browser', 'privacy page must describe juror execution accurately')
requireText(sitemap, 'https://simjury.com/privacy/', 'sitemap must include the privacy page')

requireText(headers, 'Cache-Control: no-transform', 'responses must block automatic analytics injection')
requireText(headers, "script-src 'self'", 'landing CSP must retain a self-only script policy')
requireText(headers, "connect-src 'self'", 'landing CSP must retain a self-only connection policy')
forbidText(headers, 'cloudflareinsights.com', 'CSP must not allow Cloudflare analytics')

if (failures.length) {
  console.error(`Landing-page validation failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`Landing-page validation passed: ${new Set(localReferences).size} local references resolve; copy, flow, privacy, mobile order, and CSP invariants hold.`)
