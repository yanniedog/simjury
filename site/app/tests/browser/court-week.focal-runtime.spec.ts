import { expect, test, type Page } from '@playwright/test'

async function expectComposition(page: Page, composition: 'portrait' | 'tablet' | 'desktop', focal: string) {
  const image = page.locator('.cw-stage__picture img')
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.currentSrc)).toContain(
    `/scenes/mon-arrival/${composition}.`,
  )
  await expect(image).toHaveCSS('object-position', focal)
  expect(await page.evaluate(() => (
    window as typeof window & { __focalImage?: HTMLImageElement }
  ).__focalImage === document.querySelector('.cw-stage__picture img'))).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-fixture-mounts', '1')
}

test('responsive source and focal point change together without remounting', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Responsive selection is exercised once in a real layout engine.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/browser/fixtures/focal-runtime.html')
  await expect(page.locator('.cw-stage__picture img')).toBeVisible()
  await page.evaluate(() => {
    (window as typeof window & { __focalImage?: HTMLImageElement }).__focalImage =
      document.querySelector('.cw-stage__picture img') as HTMLImageElement
  })
  await expectComposition(page, 'portrait', '56% 53%')

  await page.setViewportSize({ width: 820, height: 1180 })
  await expectComposition(page, 'tablet', '82% 46%')

  await page.setViewportSize({ width: 844, height: 390 })
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')))
  await expectComposition(page, 'desktop', '78% 46%')
})
