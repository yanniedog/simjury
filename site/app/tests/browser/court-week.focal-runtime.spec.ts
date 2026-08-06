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

test('compact mobile captions identify the speaker and keep every control reachable', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Compact mobile geometry is exercised once in a real layout engine.')
  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 560 }]) {
    await page.setViewportSize(viewport)
    await page.goto('/tests/browser/fixtures/focal-runtime.html')

    const caption = page.locator('.cw-captions span')
    await expect(caption).toBeVisible()
    await expect(caption).toHaveText('Witness: Evidence.')
    expect(Number.parseFloat(await caption.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(18)

    const geometry = await page.locator('.cw-shell').evaluate((shell) => {
      const controls = [...shell.querySelectorAll<HTMLButtonElement>('.cw-controls button')]
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        controls: controls.map((control) => {
          const box = control.getBoundingClientRect()
          return { label: control.textContent?.trim(), left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height }
        }),
        viewport: { width: innerWidth, height: innerHeight },
      }
    })
    expect(geometry.pageOverflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1)
    expect(geometry.controls).toHaveLength(6)
    for (const control of geometry.controls) {
      expect(control.left, `${viewport.width}x${viewport.height}:${control.label}`).toBeGreaterThanOrEqual(0)
      expect(control.right, `${viewport.width}x${viewport.height}:${control.label}`).toBeLessThanOrEqual(geometry.viewport.width)
      expect(control.top, `${viewport.width}x${viewport.height}:${control.label}`).toBeGreaterThanOrEqual(0)
      expect(control.bottom, `${viewport.width}x${viewport.height}:${control.label}`).toBeLessThanOrEqual(geometry.viewport.height)
      expect(control.height, `${viewport.width}x${viewport.height}:${control.label}`).toBeGreaterThanOrEqual(44)
    }
  }
})
