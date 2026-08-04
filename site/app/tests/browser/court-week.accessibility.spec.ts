import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'

const baseURL = 'http://127.0.0.1:43127'
const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

interface ProgressPosition {
  currentSessionId?: string
  currentSceneId?: string
  currentCueId?: string
}

async function prepareCourt(page: Page) {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Take your seat' })).toBeVisible()
}

async function enterReadingCourt(page: Page) {
  await prepareCourt(page)
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
}

async function readProgressPosition(page: Page): Promise<ProgressPosition | null> {
  return page.evaluate(async () => new Promise<ProgressPosition | null>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readonly')
      const get = transaction.objectStore('progress').get('cw-0001')
      get.onerror = () => reject(get.error)
      get.onsuccess = () => {
        database.close()
        const stored = get.result as ProgressPosition | undefined
        resolve(stored ? {
          currentSessionId: stored.currentSessionId,
          currentSceneId: stored.currentSceneId,
          currentCueId: stored.currentCueId,
        } : null)
      }
    }
  }))
}

async function capturePosition(page: Page) {
  await expect.poll(() => readProgressPosition(page)).not.toBeNull()
  return readProgressPosition(page)
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))).toEqual({ document: 0, body: 0 })
}

async function expectThreePixelFocusRing(locator: Locator) {
  expect(await locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: style.outlineWidth, style: style.outlineStyle }
  })).toEqual({ width: '3px', style: 'solid' })
}

test('reduced motion switches to static cuts without changing legal position', async ({ page }) => {
  await enterReadingCourt(page)
  const before = await capturePosition(page)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  await expect.poll(() => page.locator('.cw-stage__picture img').evaluate((image) => {
    const style = getComputedStyle(image)
    return {
      transform: style.transform,
      transitionsAreStatic: style.transitionDuration
        .split(',')
        .every((value) => Number.parseFloat(value) <= 0.001),
      animationsAreStatic: style.animationDuration
        .split(',')
        .every((value) => Number.parseFloat(value) <= 0.001),
    }
  })).toEqual({
    transform: 'none',
    transitionsAreStatic: true,
    animationsAreStatic: true,
  })
  await expect.poll(() => readProgressPosition(page)).toEqual(before)

  const previousCue = before?.currentCueId
  await page.getByRole('button', { name: 'Continue' }).press('Enter')
  await expect.poll(async () => (await readProgressPosition(page))?.currentCueId).not.toBe(previousCue)
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
})

test('forced colours retain labelled state, visible boundaries and legal position', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium provides Playwright forced-colours emulation.')
  await enterReadingCourt(page)
  await page.getByRole('button', { name: 'Captions' }).click()
  const before = await capturePosition(page)

  await page.emulateMedia({ forcedColors: 'active' })
  await expect.poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
  const audit = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.cw-shell')!
    const stage = document.querySelector<HTMLElement>('.cw-stage')!
    const selected = document.querySelector<HTMLElement>('button[aria-pressed="true"]')!
    const style = getComputedStyle(selected)
    return {
      forcedColorAdjust: getComputedStyle(shell).forcedColorAdjust,
      stageOverlayDisplay: getComputedStyle(stage, '::after').display,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      selectedLabel: selected.textContent?.trim(),
      selectedState: selected.getAttribute('aria-pressed'),
    }
  })
  expect(audit).toMatchObject({
    forcedColorAdjust: 'auto',
    stageOverlayDisplay: 'none',
    outlineStyle: 'solid',
    outlineWidth: '3px',
    selectedLabel: 'Captions',
    selectedState: 'true',
  })
  await expect(page.getByText('Monday', { exact: false }).first()).toBeVisible()
  await expect(page.locator('#cw-speaker-name')).not.toBeEmpty()
  await expect.poll(() => readProgressPosition(page)).toEqual(before)
})

test('keyboard-only entry, skip link and desk expose a visible three-pixel focus ring', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Headless WebKit does not expose macOS Safari full-keyboard-access link traversal.')
  await prepareCourt(page)

  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Audio first')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByLabel('Reading mode')).toBeChecked()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const entryButton = page.getByRole('button', { name: 'Take your seat' })
  await expect(entryButton).toBeFocused()
  await expectThreePixelFocusRing(entryButton)
  await page.keyboard.press('Enter')
  await expect(page.locator('.cw-shell')).toBeVisible()

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to controls' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await expect(skip).toHaveAttribute('href', '#cw-primary-controls')
  await expectThreePixelFocusRing(skip)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused()

  for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab')
  const deskTrigger = page.getByRole('button', { name: 'Juror desk', exact: true })
  await expect(deskTrigger).toBeFocused()
  await expectThreePixelFocusRing(deskTrigger)

  const before = await capturePosition(page)
  await page.keyboard.press('Enter')
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  await expect(desk.getByRole('button', { name: 'Close juror desk' })).toBeFocused()
  await expect(desk.getByRole('heading', { name: 'The charge' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(deskTrigger).toBeFocused()
  await expect.poll(() => readProgressPosition(page)).toEqual(before)
})

async function newReflowContext(browser: Browser, screen: { width: number; height: number }): Promise<BrowserContext> {
  return browser.newContext({
    baseURL,
    viewport: { width: Math.floor(screen.width / 2), height: Math.floor(screen.height / 2) },
    screen,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
}

for (const screen of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
  test(`200% effective reflow on ${screen.width}x${screen.height} retains every core action`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium owns the effective browser-zoom reflow contexts.')
    const context = await newReflowContext(browser, screen)
    const page = await context.newPage()
    try {
      await enterReadingCourt(page)
      expect(await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio }))).toEqual({
        innerWidth: Math.floor(screen.width / 2),
        innerHeight: Math.floor(screen.height / 2),
        devicePixelRatio: 2,
      })
      const before = await capturePosition(page)
      await expectNoHorizontalOverflow(page)
      for (const name of ['Play', 'Repeat', 'Captions', 'Juror desk', 'Full screen', 'Continue']) {
        const control = page.getByRole('button', { name, exact: true })
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeVisible()
      }
      await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'The charge' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expect.poll(() => readProgressPosition(page)).toEqual(before)
    } finally {
      await context.close()
    }
  })
}

test('touch, keyboard and mouse interoperate without moving the legal record', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'One mixed-input browser context proves the interaction contract.')
  const context = await browser.newContext({ baseURL, viewport: { width: 820, height: 900 }, hasTouch: true })
  const page = await context.newPage()
  try {
    await prepareCourt(page)
    await page.getByLabel('Reading mode').tap()
    await page.getByRole('button', { name: 'Take your seat' }).tap()
    const before = await capturePosition(page)

    const deskTrigger = page.getByRole('button', { name: 'Juror desk', exact: true })
    await deskTrigger.focus()
    await page.keyboard.press('Enter')
    const route = page.getByRole('dialog', { name: 'Your working papers' }).getByRole('button', { name: /Route diagram/i })
    await route.click()
    const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
    await viewer.getByRole('button', { name: 'Zoom in' }).press('Enter')
    await viewer.getByRole('button', { name: 'Move exhibit right' }).tap()
    await viewer.getByRole('button', { name: 'Close exhibit' }).click()
    await page.keyboard.press('Escape')

    await expect(deskTrigger).toBeFocused()
    await expect.poll(() => readProgressPosition(page)).toEqual(before)
    await expectNoHorizontalOverflow(page)
  } finally {
    await context.close()
  }
})
