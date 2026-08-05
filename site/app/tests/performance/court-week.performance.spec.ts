import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { DEFAULT_LOCAL_PROFILE, LOCAL_PROFILE_STORAGE_KEY } from '../../src/courtweek/state/localProfile'
import { PERFORMANCE_BASE_URL } from './environment'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
const acknowledgedProfile = JSON.stringify({
  ...DEFAULT_LOCAL_PROFILE,
  adultFictionAcknowledged: true,
})
const budgets = {
  lcpMs: 2_500,
  cls: 0.05,
  firstVisibleBytes: 1_000_000,
  playableMs: 5_000,
} as const

test.use({
  storageState: {
    cookies: [],
    origins: [{
      origin: new URL(PERFORMANCE_BASE_URL).origin,
      localStorage: [{ name: LOCAL_PROFILE_STORAGE_KEY, value: acknowledgedProfile }],
    }],
  },
})

type VitalState = { lcp: number; cls: number }

async function emulateMidRangeAndroid4g(cdp: CDPSession) {
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 200_000,
    uploadThroughput: 93_750,
    connectionType: 'cellular4g',
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

async function installMeasurement(page: Page) {
  await page.addInitScript((instant) => {
    Date.now = () => instant
    const state: VitalState = { lcp: 0, cls: 0 }
    Object.defineProperty(window, '__simjuryVitals', { value: state })
    new PerformanceObserver((list) => {
      state.lcp = Math.max(state.lcp, ...list.getEntries().map((entry) => entry.startTime))
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput: boolean; value: number }>) {
        if (!entry.hadRecentInput) state.cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  }, releaseNow)
}

async function transferredBytes(page: Page) {
  return page.evaluate(() => performance.getEntriesByType('resource').reduce(
    (sum, entry) => sum + (entry as PerformanceResourceTiming).transferSize,
    (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.transferSize ?? 0,
  ))
}

test('production entry and first session stay inside the Android 4G budgets', async ({ page, context }, testInfo) => {
  const cdp = await context.newCDPSession(page)
  await emulateMidRangeAndroid4g(cdp)
  await installMeasurement(page)

  await page.goto('/jury/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Eleven Minutes' })).toBeVisible()
  await page.waitForTimeout(100)

  const vitals = await page.evaluate(() => (window as typeof window & { __simjuryVitals: VitalState }).__simjuryVitals)
  const firstVisibleBytes = await transferredBytes(page)
  expect(vitals.lcp, 'Largest Contentful Paint').toBeGreaterThan(0)
  expect(vitals.lcp, 'Largest Contentful Paint').toBeLessThanOrEqual(budgets.lcpMs)
  expect(vitals.cls, 'Cumulative Layout Shift').toBeLessThanOrEqual(budgets.cls)
  expect(firstVisibleBytes, 'first visible screen transfer').toBeLessThanOrEqual(budgets.firstVisibleBytes)

  await page.getByLabel('Reading mode').check()
  const startedAt = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.locator('.cw-stage img')).toHaveJSProperty('complete', true)
  await expect.poll(() => page.locator('.cw-stage img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  const playableMs = await page.evaluate((start) => performance.now() - start, startedAt)
  expect(playableMs, 'Take your seat to playable session').toBeLessThanOrEqual(budgets.playableMs)

  const loadedSceneImages = await page.evaluate(() => {
    const sceneIds = performance.getEntriesByType('resource')
      .filter((entry) => entry.initiatorType === 'img' && /\/scenes\//u.test(entry.name))
      .map((entry) => new URL(entry.name).pathname.match(/\/scenes\/([^/]+)\//u)?.[1])
      .filter((id): id is string => Boolean(id))
    return [...new Set(sceneIds)]
  })
  expect(loadedSceneImages.length, 'large scene identities transferred').toBeLessThanOrEqual(2)
  expect(loadedSceneImages.every((id) => ['mon-arrival', 'mon-oath'].includes(id))).toBe(true)
  expect(await page.locator('.cw-stage img').count(), 'decoded scene image elements').toBe(1)

  const evidencePath = testInfo.outputPath('performance-budget-evidence.json')
  await writeFile(evidencePath, JSON.stringify({
    profile: 'Pixel 7a, 4x CPU, 1.6 Mbps down, 150 ms latency',
    budgets,
    measured: { vitals, firstVisibleBytes, playableMs, loadedSceneImages },
  }, null, 2))
  await testInfo.attach('performance-budget-evidence.json', {
    path: evidencePath,
    contentType: 'application/json',
  })
})
