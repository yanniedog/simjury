import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { courtWeekBootstrap } from '../../src/courtweek/sealed/bootstrap'
import { DEFAULT_LOCAL_PROFILE, LOCAL_PROFILE_STORAGE_KEY } from '../../src/courtweek/state/localProfile'

const clarityOptOutKey = 'simjury:clarity-opt-out:v1'
const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
const acknowledgedProfile = JSON.stringify({
  ...DEFAULT_LOCAL_PROFILE,
  adultFictionAcknowledged: true,
})

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

function isPinnedReleaseRequest(url: URL): boolean {
  return (
    url.hostname === 'github.com' &&
    url.pathname.startsWith(
      `/yanniedog/simjury/releases/download/${encodeURIComponent(courtWeekBootstrap.releaseTag)}/`,
    )
  )
}

test('HAR proves the initial unlocked journey is static-only and fetches no future pack', async ({ browser }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL
  if (typeof baseUrl !== 'string') throw new Error('Network test requires a configured baseURL')
  const harPath = testInfo.outputPath('court-week-network.har')
  const context = await browser.newContext({
    serviceWorkers: 'block',
    recordHar: { path: harPath, mode: 'full', content: 'omit' },
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(baseUrl).origin,
        localStorage: [
          { name: LOCAL_PROFILE_STORAGE_KEY, value: acknowledgedProfile },
          // Keep this HAR focused on the app's static gameplay contract. The
          // production audit separately requires the default-on Clarity call.
          { name: clarityOptOutKey, value: '1' },
        ],
      }],
    },
  })
  await context.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  const page = await context.newPage()
  const webSockets: string[] = []
  page.on('websocket', (socket) => webSockets.push(socket.url()))

  await page.goto(baseUrl)
  await page.locator('.cw-entry__settings > summary').click()
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

  expect(webSockets).toEqual([])
  expect(requests.filter(({ url }) => isForbiddenRuntime(url))).toEqual([])
  expect(requests.filter(({ url }) => (
    url.origin !== localOrigin &&
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
