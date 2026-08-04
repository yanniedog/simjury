import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { courtWeekBootstrap } from '../../src/courtweek/sealed/bootstrap'

const baseUrl = 'http://127.0.0.1:43127/'
const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

interface HarEntry {
  request: { method: string; url: string }
  response: { status: number; redirectURL?: string }
}

interface HarDocument {
  log: { entries: HarEntry[] }
}

function isForbiddenRuntime(url: URL): boolean {
  return (
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.hostname === 'api.github.com' ||
    url.hostname.endsWith('.workers.dev') ||
    /\/(?:api|workers?|d1|durable-objects?|ai)(?:\/|$)/iu.test(url.pathname)
  )
}

function isViteDevelopmentSocket(url: URL): boolean {
  const base = new URL(baseUrl)
  return (
    url.protocol === 'ws:' &&
    url.hostname === base.hostname &&
    url.port === base.port &&
    url.pathname === '/' &&
    url.searchParams.has('token') &&
    Array.from(url.searchParams.keys()).every((key) => key === 'token')
  )
}

function isPinnedReleaseRequest(url: URL): boolean {
  return (
    url.hostname === 'github.com' &&
    url.pathname.startsWith(
      `/yanniedog/simjury/releases/download/${encodeURIComponent(courtWeekBootstrap.releaseTag)}/`,
    )
  )
}

test('HAR proves the initial unlocked journey is static-only and fetches no future pack', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One browser records the deterministic static network contract.')
  const harPath = testInfo.outputPath('court-week-network.har')
  const context = await browser.newContext({
    serviceWorkers: 'block',
    recordHar: { path: harPath, mode: 'full', content: 'omit' },
  })
  await context.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  const page = await context.newPage()
  const webSockets: string[] = []
  page.on('websocket', (socket) => webSockets.push(socket.url()))

  await page.goto(baseUrl)
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await page.waitForTimeout(250)
  await context.close()

  await testInfo.attach('court-week-network.har', {
    path: harPath,
    contentType: 'application/json',
  })
  const har = JSON.parse(await readFile(harPath, 'utf8')) as HarDocument
  const requests = har.log.entries.map((entry) => ({
    method: entry.request.method,
    status: entry.response.status,
    url: new URL(entry.request.url),
  }))
  const localOrigin = new URL(baseUrl).origin
  const pinnedReleaseRedirects = new Set(har.log.entries.flatMap((entry) => {
    if (!isPinnedReleaseRequest(new URL(entry.request.url)) || !entry.response.redirectURL) return []
    const redirect = new URL(entry.response.redirectURL)
    return redirect.hostname === 'release-assets.githubusercontent.com' ? [redirect.href] : []
  }))

  expect(webSockets.filter((address) => !isViteDevelopmentSocket(new URL(address)))).toEqual([])
  expect(requests.filter(({ url }) => (
    isForbiddenRuntime(url) && !isViteDevelopmentSocket(url)
  ))).toEqual([])
  expect(requests.filter(({ url }) => (
    url.origin !== localOrigin &&
    !isViteDevelopmentSocket(url) &&
    !isPinnedReleaseRequest(url) &&
    !pinnedReleaseRedirects.has(url.href)
  ))).toEqual([])
  expect(requests.filter(({ method }) => method !== 'GET' && method !== 'HEAD')).toEqual([])
  expect(requests.filter(({ status }) => status >= 400 || status === 0)).toEqual([])

  const packRequests = requests.filter(({ url }) => url.pathname.endsWith('.sjp'))
  expect(packRequests.map(({ url }) => url.pathname.split('/').at(-1))).toEqual([
    courtWeekBootstrap.sessions[0].locator,
  ])
  expect(packRequests.filter(({ url }) => courtWeekBootstrap.sessions.slice(1).some(
    (session) => url.pathname.endsWith(session.locator),
  ))).toEqual([])
  expect(requests.filter(({ url }) => /\/(?:keys\/)?day0[2-7](?:\.|-)/u.test(url.pathname))).toEqual([])
})
