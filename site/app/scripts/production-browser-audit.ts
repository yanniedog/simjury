import { chromium, type Locator, type Page, type Response } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const target = new URL(process.env.SIMJURY_AUDIT_URL ?? 'https://simjury.com/')
const runCount = Math.max(1, Number.parseInt(process.env.SIMJURY_AUDIT_RUNS ?? '1', 10) || 1)
const output = join(process.cwd(), 'test-results', 'production-audit')
const profile = JSON.stringify({
  schemaVersion: 'simjury-local-profile-v1', jurorLabel: 'Synthetic QA',
  adultFictionAcknowledged: true, developerMode: true,
})
const profiles = [
  { name: 'mobile', width: 360, height: 800, allSessions: false },
  { name: 'desktop', width: 1440, height: 900, allSessions: true },
] as const

type Severity = 'high' | 'medium' | 'low'
type Finding = { severity: Severity; category: string; profile: string; message: string }
type Action = { label: string; milliseconds: number; blocked: boolean }
type Metrics = { ttfbMs: number; lcpMs: number; cls: number; entryBytes: number; overflowPx: number; smallTargets: number }
type Journey = { profile: string; run: number; status: 'PASS' | 'FAIL' | 'BLOCKED'; sessions: string[]; actions: Action[]; metrics?: Metrics }

const findings: Finding[] = []
const journeys: Journey[] = []
const add = (severity: Severity, category: string, profileName: string, message: string) => {
  if (!findings.some((item) => item.severity === severity && item.category === category && item.profile === profileName && item.message === message)) {
    findings.push({ severity, category, profile: profileName, message })
  }
}
const safeUrl = (value: string) => {
  const url = new URL(value)
  return `${url.origin}${url.pathname}`
}

async function pointerClick(page: Page, locator: Locator, label: string, actions: Action[]) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${label} has no clickable box`)
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const blocked = !await locator.evaluate((element, coordinates) => {
    const hit = document.elementFromPoint(coordinates.x, coordinates.y)
    return Boolean(hit && (hit === element || element.contains(hit) || hit.contains(element)))
  }, point)
  await page.mouse.move(point.x, point.y, { steps: 12 })
  const started = Date.now()
  await locator.click({ timeout: 10_000 })
  actions.push({ label, milliseconds: Date.now() - started, blocked })
}

async function gotoPublicPage(page: Page, profileName: string): Promise<Response | null> {
  let response: Response | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const challenge = response?.headers()['cf-mitigated'] === 'challenge' || await page.locator(
      '#challenge-running, .cf-challenge, [name="cf-turnstile-response"]',
    ).count() > 0
    if (!challenge) return response
    if (attempt === 1) await page.waitForTimeout(5_000)
  }
  add('high', 'cloudflare', profileName, 'Cloudflare challenge remained after the bounded browser retry.')
  return response
}

async function inspectLayout(page: Page, profileName: string) {
  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0
          && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight
      })
    const small = controls.flatMap((element) => {
      const target = element.closest<HTMLElement>('label') ?? element
      const box = target.getBoundingClientRect()
      if (box.width >= 44 && box.height >= 44) return []
      const name = element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName.toLowerCase()
      return [`${name.slice(0, 60)} (${Math.round(box.width)}x${Math.round(box.height)})`]
    })
    const images = [...document.images].filter((image) => image.complete && image.naturalWidth === 0)
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      small,
      brokenImages: images.length,
    }
  })
  if (layout.overflow > 1) add('high', 'layout', profileName, `Horizontal overflow is ${layout.overflow}px.`)
  if (layout.small.length > 0) add('medium', 'accessibility', profileName, `Targets below 44x44px: ${layout.small.join(', ')}.`)
  if (layout.brokenImages > 0) add('high', 'media', profileName, `${layout.brokenImages} visible images failed to decode.`)
  return layout
}

async function runJourney(profileInfo: typeof profiles[number], run: number) {
  const id = `${profileInfo.name}-${run}`
  const tracePath = join(output, `${id}.zip`)
  const screenshotPath = join(output, `${id}.webp`)
  const actions: Action[] = []
  const sessions: string[] = []
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: profileInfo.width, height: profileInfo.height },
    reducedMotion: 'reduce', serviceWorkers: 'block',
    storageState: { cookies: [], origins: [{ origin: target.origin, localStorage: [
      { name: 'simjury:court-week:local-profile:v1', value: profile },
    ] }] },
  })
  await context.tracing.start({ screenshots: true, snapshots: true })
  await context.addInitScript(() => {
    const state = { lcp: 0, cls: 0, violations: [] as string[] }
    Object.defineProperty(window, '__simjuryAudit', { value: state })
    new PerformanceObserver((list) => {
      state.lcp = Math.max(state.lcp, ...list.getEntries().map((entry) => entry.startTime))
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput: boolean; value: number }>) {
        if (!entry.hadRecentInput) state.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
    document.addEventListener('securitypolicyviolation', (event) => state.violations.push(`${event.violatedDirective}: ${event.blockedURI}`))
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') add('high', 'console', id, message.text())
  })
  page.on('pageerror', (error) => add('high', 'javascript', id, error.message))
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown'
    const url = new URL(request.url())
    if (reason.includes('ERR_ABORTED') && url.hostname === 'release-assets.githubusercontent.com') return
    add('high', 'network', id, `${request.method()} ${safeUrl(request.url())} failed: ${reason}`)
  })
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) add('high', 'network', id, `Unexpected ${request.method()} request to ${safeUrl(request.url())}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) add('high', 'network', id, `${response.status()} ${safeUrl(response.url())}`)
  })

  try {
    const response = await gotoPublicPage(page, id)
    const challenged = response?.headers()['cf-mitigated'] === 'challenge' || await page.locator('#challenge-running, .cf-challenge').count() > 0
    if (challenged) {
      journeys.push({ profile: profileInfo.name, run, status: 'BLOCKED', sessions, actions })
      return
    }
    await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 15_000 })
    const navigation = await page.evaluate(() => performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
    const entryBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce(
      (sum, entry) => sum + (entry as PerformanceResourceTiming).transferSize, 0,
    ))
    await pointerClick(page, page.locator('.cw-local-profile > summary'), 'Open local profile', actions)
    await pointerClick(page, page.getByRole('button', { name: 'Open all-session preview' }), 'Open developer preview', actions)
    await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 20_000 })

    const ordinals = profileInfo.allSessions ? [1, 2, 3, 4, 5, 6, 7] : [1]
    for (const ordinal of ordinals) {
      if (ordinal > 1) {
        await pointerClick(page, page.getByRole('button', { name: 'DEV preview' }), 'Open preview session picker', actions)
        await page.locator('#cw-developer-day-modal').selectOption(String(ordinal))
        await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 20_000 })
      }
      await page.getByLabel('Reading mode').check()
      const started = Date.now()
      await pointerClick(page, page.getByRole('button', { name: 'Take your seat' }), `Take seat session ${ordinal}`, actions)
      await page.locator('.cw-shell').waitFor({ state: 'visible', timeout: 20_000 })
      const playable = Date.now() - started
      if (playable > 8_000) add('high', 'performance', id, `Session ${ordinal} became playable in ${playable}ms.`)
      else if (playable > 5_000) add('medium', 'performance', id, `Session ${ordinal} became playable in ${playable}ms.`)
      const day = await page.locator('.cw-status').innerText().catch(() => `Session ${ordinal}`)
      sessions.push(day.replace(/\s+/gu, ' ').trim())
      await page.mouse.move(profileInfo.width * .75, profileInfo.height * .3, { steps: 16 })
      if (ordinal === 1) {
        await pointerClick(page, page.getByRole('button', { name: 'Juror desk', exact: true }), 'Open juror desk', actions)
        await page.getByRole('dialog', { name: 'Your working papers' }).waitFor({ state: 'visible' })
        await pointerClick(page, page.getByRole('button', { name: 'Close juror desk' }), 'Close juror desk', actions)
      }
    }
    const layout = await inspectLayout(page, id)
    await page.screenshot({ path: screenshotPath, type: 'webp', fullPage: true })
    const vital = await page.evaluate(() => (window as typeof window & { __simjuryAudit: { lcp: number; cls: number; violations: string[] } }).__simjuryAudit)
    vital.violations.forEach((violation) => add('high', 'csp', id, violation))
    actions.filter((action) => action.blocked).forEach((action) => add('high', 'click-blocker', id, `${action.label} was obscured at its centre point.`))
    actions.filter((action) => action.milliseconds > 1_000).forEach((action) => add('high', 'performance', id, `${action.label} took ${action.milliseconds}ms.`))
    journeys.push({ profile: profileInfo.name, run, status: findings.some((item) => item.profile === id && item.severity === 'high') ? 'FAIL' : 'PASS', sessions, actions,
      metrics: { ttfbMs: navigation.responseStart, lcpMs: vital.lcp, cls: vital.cls, entryBytes, overflowPx: layout.overflow, smallTargets: layout.small.length } })
  } catch (error) {
    add('high', 'journey', id, error instanceof Error ? error.message : String(error))
    journeys.push({ profile: profileInfo.name, run, status: 'FAIL', sessions, actions })
  } finally {
    await context.tracing.stop({ path: tracePath }).catch(() => undefined)
    await context.close()
    await browser.close()
  }
}

await mkdir(output, { recursive: true })
for (let run = 1; run <= runCount; run += 1) for (const item of profiles) await runJourney(item, run)
const median = (values: number[]) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0
const performanceSummary: Record<string, { ttfbMs: number; lcpMs: number; cls: number; entryBytes: number }> = {}
for (const item of profiles) {
  const measured = journeys.filter((journey) => journey.profile === item.name && journey.metrics).map((journey) => journey.metrics!)
  const lcp = median(measured.map((value) => value.lcpMs))
  const cls = median(measured.map((value) => value.cls))
  const ttfb = median(measured.map((value) => value.ttfbMs))
  performanceSummary[item.name] = { ttfbMs: ttfb, lcpMs: lcp, cls, entryBytes: median(measured.map((value) => value.entryBytes)) }
  if (lcp > 4_000) add('high', 'performance', item.name, `Median LCP was ${Math.round(lcp)}ms.`)
  else if (lcp > 2_500) add('medium', 'performance', item.name, `Median LCP was ${Math.round(lcp)}ms.`)
  if (cls > .1) add('high', 'performance', item.name, `Median CLS was ${cls.toFixed(3)}.`)
  else if (cls > .05) add('medium', 'performance', item.name, `Median CLS was ${cls.toFixed(3)}.`)
  if (ttfb > 3_000) add('high', 'performance', item.name, `Median TTFB was ${Math.round(ttfb)}ms.`)
  else if (ttfb > 1_800) add('medium', 'performance', item.name, `Median TTFB was ${Math.round(ttfb)}ms.`)
}
const status = findings.some((item) => item.severity === 'high') ? 'FAIL'
  : journeys.some((item) => item.status === 'BLOCKED') ? 'BLOCKED'
  : findings.some((item) => item.severity === 'medium') ? 'WARN' : 'PASS'
const report = { schema: 'simjury.production-audit/v1', target: target.href, startedAt: new Date().toISOString(), status, runCount, performance: performanceSummary, journeys, findings }
const markdown = [
  `# SimJury production browser audit: ${status}`,
  '', `Target: ${target.href}`, `Runs: ${runCount} per profile`,
  '', '## Coverage',
  ...journeys.map((item) => `- ${item.profile} run ${item.run}: ${item.status}; ${item.sessions.length} session openings; ${item.actions.length} pointer actions`),
  '', '## Median performance',
  ...Object.entries(performanceSummary).map(([name, value]) => `- ${name}: TTFB ${Math.round(value.ttfbMs)}ms; LCP ${Math.round(value.lcpMs)}ms; CLS ${value.cls.toFixed(3)}; entry ${(value.entryBytes / 1024).toFixed(0)}KiB`),
  '', '## Findings',
  ...(findings.length ? findings.map((item) => `- **${item.severity.toUpperCase()} ${item.category}** (${item.profile}): ${item.message}`) : ['- None.']),
  '', 'This report is deterministic Playwright output. It uses no LLM or model tokens. Cloudflare challenges are reported, never bypassed.',
].join('\n')
await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(join(output, 'report.md'), `${markdown}\n`)
console.log(markdown)
if (status === 'FAIL' || status === 'BLOCKED') process.exitCode = 1
