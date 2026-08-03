import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function enterCourt(page: Page) {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  const prohibited: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^wss?:/.test(url.protocol) || /\/(api|workers?|d1|durable-object|ai)(\/|$)/i.test(url.pathname) || url.hostname === 'api.github.com') {
      prohibited.push(request.url())
    }
  })
  await page.goto('/')
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.getByText('Monday', { exact: false }).first()).toBeVisible()
  return prohibited
}

const viewports = [
  [320, 568], [360, 800], [390, 844], [412, 915], [844, 390], [915, 412],
  [768, 1024], [820, 1180], [1024, 768], [1180, 820], [500, 900], [700, 900],
  [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
] as const

test.describe('responsive Court Week shell', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'full viewport matrix runs once')

  for (const [width, height] of viewports) {
    for (const zoom of [1, 2]) {
      test(`${width}x${height} at ${zoom * 100}%`, async ({ page }, testInfo) => {
        // Browser zoom reduces the layout viewport; emulate that reflow without
        // CSS `zoom`, which scales fixed-position boxes without browser reflow.
        await page.setViewportSize({ width: Math.floor(width / zoom), height: Math.floor(height / zoom) })
        const prohibited = await enterCourt(page)
        await expect(page.getByRole('button', { name: 'Juror desk', exact: true })).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
        expect(prohibited).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`court-${width}x${height}-${zoom * 100}.png`) })
      })
    }
  }
})

test('core flow remains playable across browser engines', async ({ page }) => {
  const prohibited = await enterCourt(page)
  await page.getByRole('button', { name: 'Juror desk' }).click()
  await expect(page.getByRole('dialog', { name: 'Your working papers' })).toBeVisible()
  await page.getByRole('button', { name: /Distress recording/i }).click()
  await expect(page.getByRole('dialog', { name: /Distress recording/i })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByRole('button', { name: 'Close exhibit' }).click()
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('button', { name: 'Juror desk', exact: true })).toBeVisible()
  expect(prohibited).toEqual([])
})
