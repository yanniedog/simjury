import { expect, test } from '@playwright/test'

test('CourtSheet keeps all fixed actions reachable at 320px and becomes a desktop side sheet', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'responsive geometry runs once')
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/tests/browser/fixtures/court-sheet.html')
  await page.getByRole('button', { name: 'Open court sheet' }).click()

  const sheet = page.getByRole('dialog', { name: 'Your working papers' })
  const body = sheet.locator('.cw-sheet__body')
  const header = sheet.locator('.cw-sheet__header')
  const footer = sheet.locator('.cw-sheet__footer')
  const phoneBox = await sheet.boundingBox()
  expect(phoneBox?.x).toBeGreaterThanOrEqual(0)
  expect(phoneBox?.width).toBeGreaterThanOrEqual(319)
  expect(phoneBox?.height).toBeGreaterThanOrEqual(567)
  await expect(header).toHaveCSS('position', 'sticky')
  await expect(footer).toHaveCSS('position', 'sticky')

  const footerBeforeScroll = await footer.boundingBox()
  await body.evaluate((element) => { element.scrollTop = element.scrollHeight })
  expect((await footer.boundingBox())?.y).toBeCloseTo(footerBeforeScroll!.y, 0)
  for (const button of await sheet.locator('header button, footer button').all()) {
    const box = await button.boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    expect(box?.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(568)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.setViewportSize({ width: 1280, height: 800 })
  const desktopBox = await sheet.boundingBox()
  expect(desktopBox?.width).toBeGreaterThanOrEqual(419)
  expect(desktopBox?.width).toBeLessThanOrEqual(421)
  expect(desktopBox!.x + desktopBox!.width).toBeCloseTo(1280, 0)
})
