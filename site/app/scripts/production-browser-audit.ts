import { chromium, type Locator, type Page, type Response } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const target = new URL(process.env.SIMJURY_AUDIT_URL ?? 'https://simjury.com/')
if (target.href !== 'https://simjury.com/') throw new Error('Production audits only target https://simjury.com/.')
const runCount = Math.max(1, Number.parseInt(process.env.SIMJURY_AUDIT_RUNS ?? '1', 10) || 1)
const expectClarity = process.env.SIMJURY_EXPECT_CLARITY === '1'
const expectedDeploymentSha = process.env.SIMJURY_EXPECT_DEPLOYMENT_SHA
if (expectedDeploymentSha && !/^[0-9a-f]{40}$/u.test(expectedDeploymentSha)) {
  throw new Error('SIMJURY_EXPECT_DEPLOYMENT_SHA must be a full commit SHA.')
}
const output = join(process.cwd(), 'test-results', 'production-audit')
const audioStartTimeoutMs = 15_000
const controlTimeoutMs = 5_000
// Seed the state a returning browser holds before the adult gate: developer
// mode on, acknowledgement still pending. The audit then walks the same
// progressive entry a visitor walks, and acknowledging the gate carries the
// temporary all-session preview default into DEV PREVIEW, which is how the
// audit reaches sessions beyond the one the live schedule has opened.
const profile = JSON.stringify({
  schemaVersion: 'simjury-local-profile-v1', jurorLabel: 'Synthetic QA',
  adultFictionAcknowledged: false, developerMode: true,
})
const profiles = [
  { name: 'small-phone', width: 320, height: 568, mobile: true, allSessions: false },
  { name: 'browser-chrome-reduced', width: 360, height: 560, mobile: true, allSessions: false },
  { name: 'phone-landscape', width: 568, height: 320, mobile: true, allSessions: false },
  { name: 'tablet-portrait', width: 768, height: 1024, mobile: true, allSessions: false },
  { name: 'desktop-200-percent', width: 720, height: 450, mobile: false, allSessions: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false, allSessions: true },
] as const

type Severity = 'high' | 'medium' | 'low'
type Finding = { severity: Severity; category: string; profile: string; message: string }
type Action = { label: string; milliseconds: number; blocked: boolean; initiallyClipped: boolean }
type Metrics = { ttfbMs: number; lcpMs: number; cls: number; entryBytes: number; overflowPx: number; smallTargets: number; clippedTargets: number }
type Journey = { profile: string; run: number; status: 'PASS' | 'FAIL' | 'BLOCKED'; sessions: string[]; actions: Action[]; clarityCollects: number; metrics?: Metrics }

const findings: Finding[] = []
const journeys: Journey[] = []
// Findings land in whichever sink is active. A journey attempt owns its own
// sink so an attempt discarded as deployment skew leaves nothing behind.
// Journeys are awaited one at a time, so a single active sink is unambiguous.
let sink: Finding[] = findings
const add = (severity: Severity, category: string, profileName: string, message: string) => {
  if (!sink.some((item) => item.severity === severity && item.category === category && item.profile === profileName && item.message === message)) {
    sink.push({ severity, category, profile: profileName, message })
  }
}
const safeUrl = (value: string) => {
  const url = new URL(value)
  return `${url.origin}${url.pathname}`
}
// Every hashed asset under /jury/assets/ ships in the same build as the shell
// that references it, so inside one deployment such a request cannot miss. A
// miss means the browser was handed one deployment's shell while the edge
// answered from another's asset manifest.
const isBuildAsset = (value: string) => new URL(value).pathname.startsWith('/jury/assets/')
const isClarityCollect = (value: string) => {
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname.endsWith('.clarity.ms') && url.pathname === '/collect'
}

async function verifyDeploymentIdentity() {
  if (!expectedDeploymentSha) return { verified: true, superseded: false, servedSha: null }
  const marker = new URL('/.well-known/simjury-deployment.json', target)
  marker.searchParams.set('expected', expectedDeploymentSha)
  try {
    const response = await fetch(marker, { headers: { 'Cache-Control': 'no-cache' } })
    if (!response.ok) throw new Error(`marker returned ${response.status}`)
    const body = await response.json() as { sha?: unknown }
    if (typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/u.test(body.sha)) throw new Error('marker SHA is invalid')
    return { verified: body.sha === expectedDeploymentSha, superseded: body.sha !== expectedDeploymentSha, servedSha: body.sha }
  } catch (error) {
    add('high', 'deployment-identity', 'all profiles', `Could not verify the served deployment: ${error instanceof Error ? error.message : String(error)}.`)
    return { verified: false, superseded: false, servedSha: null }
  }
}

async function pointerClick(page: Page, locator: Locator, label: string, actions: Action[], mustStartVisible = false) {
  const initialBox = await locator.boundingBox()
  const viewport = page.viewportSize()
  const initiallyClipped = Boolean(mustStartVisible && initialBox && viewport && (
    initialBox.x < 0 || initialBox.y < 0
    || initialBox.x + initialBox.width > viewport.width
    || initialBox.y + initialBox.height > viewport.height
  ))
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
  actions.push({ label, milliseconds: Date.now() - started, blocked, initiallyClipped })
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

async function inspectLayout(page: Page, profileName: string, scope = '') {
  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')]
      .filter((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return !element.matches('.cw-visually-hidden, .cw-skip-link:not(:focus)')
          && style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0
      })
    const small = controls.flatMap((element) => {
      const target = element.closest<HTMLElement>('label') ?? element
      const box = target.getBoundingClientRect()
      if (box.width >= 44 && box.height >= 44) return []
      const name = element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName.toLowerCase()
      return [`${name.slice(0, 60)} (${Math.round(box.width)}x${Math.round(box.height)})`]
    })
    const clipped = controls.flatMap((element) => {
      const box = (element.closest<HTMLElement>('label') ?? element).getBoundingClientRect()
      if (box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight) return []
      const name = element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName.toLowerCase()
      return [`${name.slice(0, 60)} (${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)})`]
    })
    const images = [...document.images].filter((image) => image.complete && image.naturalWidth === 0)
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      small, clipped,
      brokenImages: images.length,
    }
  })
  const prefix = scope ? `${scope}: ` : ''
  if (layout.overflow > 1) add('high', 'layout', profileName, `${prefix}Horizontal overflow is ${layout.overflow}px.`)
  if (layout.small.length > 0) add('medium', 'accessibility', profileName, `${prefix}Targets below 44x44px: ${layout.small.join(', ')}.`)
  if (layout.clipped.length > 0) add('high', 'layout', profileName, `${prefix}Actionable controls are clipped by the viewport: ${layout.clipped.join(', ')}.`)
  if (layout.brokenImages > 0) add('high', 'media', profileName, `${prefix}${layout.brokenImages} visible images failed to decode.`)
  return layout
}

type Attempt = { journey: Journey; findings: Finding[]; assetMisses: string[] }

async function attemptJourney(profileInfo: typeof profiles[number], run: number): Promise<Attempt> {
  const id = `${profileInfo.name}-${run}`
  const actions: Action[] = []
  const sessions: string[] = []
  const attemptFindings: Finding[] = []
  const assetMisses = new Set<string>()
  sink = attemptFindings
  let clarityCollects = 0
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: profileInfo.width, height: profileInfo.height },
    screen: { width: profileInfo.width, height: profileInfo.height },
    isMobile: profileInfo.mobile, hasTouch: profileInfo.mobile,
    deviceScaleFactor: profileInfo.mobile ? 2.75 : 1,
    reducedMotion: 'reduce', serviceWorkers: 'block',
    storageState: { cookies: [], origins: [{ origin: target.origin, localStorage: [
      { name: 'simjury:court-week:local-profile:v1', value: profile },
    ] }] },
  })
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
    if (isBuildAsset(request.url())) assetMisses.add(safeUrl(request.url()))
    add('high', 'network', id, `${request.method()} ${safeUrl(request.url())} failed: ${reason}`)
  })
  page.on('request', (request) => {
    if (request.method() === 'POST' && isClarityCollect(request.url())) {
      clarityCollects += 1
      return
    }
    if (!['GET', 'HEAD'].includes(request.method())) add('high', 'network', id, `Unexpected ${request.method()} request to ${safeUrl(request.url())}`)
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    if (isBuildAsset(response.url())) assetMisses.add(safeUrl(response.url()))
    add('high', 'network', id, `${response.status()} ${safeUrl(response.url())}`)
  })

  const finish = (journey: Journey): Attempt => ({ journey, findings: attemptFindings, assetMisses: [...assetMisses] })
  try {
    const response = await gotoPublicPage(page, id)
    const challenged = response?.headers()['cf-mitigated'] === 'challenge' || await page.locator('#challenge-running, .cf-challenge').count() > 0
    if (challenged) {
      return finish({ profile: profileInfo.name, run, status: 'BLOCKED', sessions, actions, clarityCollects })
    }
    await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 15_000 })
    const navigation = await page.evaluate(() => performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
    const entryBytes = await page.evaluate(() => performance.getEntriesByType('resource').reduce(
      (sum, entry) => sum + (entry as PerformanceResourceTiming).transferSize, 0,
    ))
    // The adult gate is the first control on the entry page, and under the
    // temporary preview default acknowledging it opens all-session preview
    // directly — no settings or local-profile detour. When that default is
    // reverted, restore the explicit `Open all-session preview` path here.
    await pointerClick(page, page.getByRole('checkbox', { name: /18 or older/u }), 'Acknowledge the adult gate', actions)
    await page.getByRole('complementary', { name: 'Developer preview controls' }).waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 20_000 })

    const ordinals = profileInfo.allSessions ? [1, 2, 3, 4, 5, 6, 7] : [1]
    const layouts: Awaited<ReturnType<typeof inspectLayout>>[] = []
    for (const ordinal of ordinals) {
      if (ordinal > 1) {
        await pointerClick(page, page.getByRole('button', { name: 'DEV preview' }), 'Open preview session picker', actions, true)
        await page.locator('#cw-developer-day-modal').selectOption(String(ordinal))
        await page.getByRole('heading', { name: 'Eleven Minutes' }).waitFor({ state: 'visible', timeout: 20_000 })
      }
      const auditsAudio = ordinal === 1
      const experienceSettings = page.locator('.cw-entry__settings')
      if (!await experienceSettings.evaluate((element) => element.hasAttribute('open'))) {
        await pointerClick(page, experienceSettings.locator(':scope > summary'), `Open experience settings for session ${ordinal}`, actions)
      }
      await page.getByLabel(auditsAudio ? 'Audio and captions' : 'Reading mode').check()
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
        const controls = page.getByLabel('Court playback controls')
        const pause = controls.getByRole('button', { name: 'Pause' })
        const mediaFallback = page.getByRole('status').filter({
          hasText: /Audio is unavailable|Recorded audio could not be loaded/i,
        })
        const audioState = await Promise.race([
          pause.waitFor({ state: 'visible', timeout: audioStartTimeoutMs }).then(() => 'playing'),
          mediaFallback.waitFor({ state: 'visible', timeout: audioStartTimeoutMs }).then(() => 'unavailable'),
        ])
        const fallbackText = await mediaFallback.count() ? await mediaFallback.first().textContent() : null
        const recordedAudioPlaying = audioState === 'playing' && !fallbackText
        if (!recordedAudioPlaying) {
          add('high', 'audio', id, `Recorded narration fell back on production Chromium${fallbackText ? `: ${fallbackText}` : '.'}`)
        } else {
          await pointerClick(page, pause, 'Pause narration', actions, true)
          const resume = controls.getByRole('button', { name: 'Resume' })
          await resume.waitFor({ state: 'visible', timeout: controlTimeoutMs })
          await pointerClick(page, resume, 'Resume narration', actions, true)
          await pause.waitFor({ state: 'visible', timeout: controlTimeoutMs })
        }
        await pointerClick(page, page.getByRole('button', { name: 'Juror desk', exact: true }), 'Open juror desk', actions, true)
        await page.getByRole('dialog', { name: 'Your working papers' }).waitFor({ state: 'visible' })
        if (recordedAudioPlaying) {
          await page.locator('.cw-controls button', { hasText: 'Resume' }).waitFor({ state: 'attached', timeout: controlTimeoutMs })
        }
        await pointerClick(page, page.getByRole('button', { name: 'Close juror desk' }), 'Close juror desk', actions, true)
        await page.getByRole('dialog', { name: 'Your working papers' }).waitFor({ state: 'hidden', timeout: controlTimeoutMs })
        if (recordedAudioPlaying) await pause.waitFor({ state: 'visible', timeout: controlTimeoutMs })
      }
      layouts.push(await inspectLayout(page, id, `Session ${ordinal}`))
    }
    const layout = {
      overflow: Math.max(0, ...layouts.map((item) => item.overflow)),
      small: layouts.flatMap((item) => item.small),
      clipped: layouts.flatMap((item) => item.clipped),
    }
    const vital = await page.evaluate(() => (window as typeof window & { __simjuryAudit: { lcp: number; cls: number; violations: string[] } }).__simjuryAudit)
    vital.violations.forEach((violation) => add('high', 'csp', id, violation))
    actions.filter((action) => action.blocked).forEach((action) => add('high', 'click-blocker', id, `${action.label} was obscured at its centre point.`))
    actions.filter((action) => action.initiallyClipped).forEach((action) => add('high', 'layout', id, `${action.label} required synthetic scrolling because it began outside the viewport.`))
    actions.filter((action) => action.milliseconds > 1_000).forEach((action) => add('high', 'performance', id, `${action.label} took ${action.milliseconds}ms.`))
    return finish({ profile: profileInfo.name, run, status: attemptFindings.some((item) => item.profile === id && item.severity === 'high') ? 'FAIL' : 'PASS', sessions, actions,
      clarityCollects,
      metrics: { ttfbMs: navigation.responseStart, lcpMs: vital.lcp, cls: vital.cls, entryBytes, overflowPx: layout.overflow, smallTargets: layout.small.length, clippedTargets: layout.clipped.length } })
  } catch (error) {
    add('high', 'journey', id, error instanceof Error ? error.message : String(error))
    return finish({ profile: profileInfo.name, run, status: 'FAIL', sessions, actions, clarityCollects })
  } finally {
    await context.close()
    await browser.close()
    sink = findings
  }
}

function commitAttempt(attempt: Attempt) {
  attempt.findings.forEach((item) => add(item.severity, item.category, item.profile, item.message))
  journeys.push(attempt.journey)
}

async function runJourney(profileInfo: typeof profiles[number], run: number) {
  const id = `${profileInfo.name}-${run}`
  const first = await attemptJourney(profileInfo, run)
  if (first.assetMisses.length === 0) {
    commitAttempt(first)
    return
  }
  // A hashed asset went missing, so this attempt straddled two deployments:
  // Cloudflare Static Assets served a shell whose chunks the current manifest
  // no longer carries. Skew does not survive a fresh navigation, a genuinely
  // broken reference does — so re-run once and keep the second attempt either
  // way. A repeat miss stays a HIGH finding.
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  const second = await attemptJourney(profileInfo, run)
  commitAttempt(second)
  if (second.assetMisses.length === 0) {
    add('low', 'deployment-identity', id, `A superseded shell was served on the first attempt: ${first.assetMisses.join(', ')} was absent from the deployment the edge answered from. The retry ran against one coherent deployment.`)
  }
}

await mkdir(output, { recursive: true })
const deploymentIdentity = await verifyDeploymentIdentity()
if (deploymentIdentity.superseded) {
  add('low', 'deployment-identity', 'all profiles', `Deployment ${expectedDeploymentSha} was superseded before its audit began; the served SHA is ${deploymentIdentity.servedSha}.`)
} else if (deploymentIdentity.verified) {
  for (let run = 1; run <= runCount; run += 1) for (const item of profiles) await runJourney(item, run)
}
const nonBlockedJourneys = journeys.filter((journey) => journey.status !== 'BLOCKED')
if (expectClarity && nonBlockedJourneys.length > 0 && nonBlockedJourneys.every((journey) => journey.clarityCollects === 0)) {
  add('high', 'analytics', 'all profiles', 'Microsoft Clarity did not send any collection requests.')
}
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
const status = deploymentIdentity.superseded ? 'SUPERSEDED'
  : !deploymentIdentity.verified ? 'BLOCKED'
    : findings.some((item) => item.severity === 'high') ? 'FAIL'
  : journeys.some((item) => item.status === 'BLOCKED') ? 'BLOCKED'
  : findings.some((item) => item.severity === 'medium') ? 'WARN' : 'PASS'
const report = { schema: 'simjury.production-audit/v1', target: target.href, expectedDeploymentSha: expectedDeploymentSha ?? null, servedDeploymentSha: deploymentIdentity.servedSha, startedAt: new Date().toISOString(), status, runCount, performance: performanceSummary, journeys, findings }
const markdown = [
  `# SimJury production browser audit: ${status}`,
  '', `Target: ${target.href}`, `Runs: ${runCount} per profile`,
  '', '## Coverage',
  ...journeys.map((item) => `- ${item.profile} run ${item.run}: ${item.status}; ${item.sessions.length} session openings; ${item.actions.length} pointer actions; ${item.clarityCollects} Clarity collections`),
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
