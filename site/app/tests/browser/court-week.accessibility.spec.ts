import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { elevenMinutesCourtWeek } from '../../src/courtweek/content/elevenMinutes'

const baseURL = 'http://127.0.0.1:43127'
const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
// Passive observation gates are gone. The first real contribution boundary is
// the oath-or-affirmation choice at the end of the next scene.
const firstMandatoryScene = elevenMinutesCourtWeek.manifest.sessions[0]?.scenes.find(
  ({ interaction }) => interaction?.kind !== 'observe',
)
const firstMandatoryCue = firstMandatoryScene?.cues.at(-1)
const firstMandatoryCueId = firstMandatoryCue?.sourceCueId ?? firstMandatoryCue?.id

if (!firstMandatoryCueId) throw new Error('The first mandatory scene must contain at least one cue.')

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
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
}

async function mountRecordedAudioCourt(page: Page) {
  // Navigate directly to a fixture-only document so the production
  // SealedCourtWeekApp never mounts a competing progress writer.
  await page.goto(`/tests/browser/fixtures/audioCourtWeekHarness.html?instant=${releaseNow}`)
  await expect(page.getByRole('button', { name: 'Take your seat' })).toBeVisible()
}

async function readProgressPosition(page: Page): Promise<ProgressPosition | null> {
  return page.evaluate(async () => new Promise<ProgressPosition | null>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readonly')
      const get = transaction.objectStore('progress').get(['cw-0001', '2026.08.03-r2'])
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
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  await expect(desk).toHaveCSS('forced-color-adjust', 'auto')
  await expect(desk.locator('.cw-sheet__header')).toHaveCSS('position', 'sticky')
  await expect(desk.locator('.cw-sheet__footer')).toHaveCSS('position', 'sticky')
  await desk.getByRole('button', { name: /Route diagram/i }).click()
  const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
  await expect(viewer).toHaveCSS('forced-color-adjust', 'auto')
  await expect(viewer.locator('.cw-sheet__footer')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect.poll(() => readProgressPosition(page)).toEqual(before)
})

test('keyboard-only entry, skip link and desk expose a visible three-pixel focus ring', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Headless WebKit does not expose macOS Safari full-keyboard-access link traversal.')
  await prepareCourt(page)

  await page.keyboard.press('Tab')
  const entryButton = page.getByRole('button', { name: 'Take your seat' })
  await expect(entryButton).toBeFocused()
  await expectThreePixelFocusRing(entryButton)
  await page.keyboard.press('Tab')
  const settings = page.locator('.cw-entry__settings > summary')
  await expect(settings).toBeFocused()
  await expectThreePixelFocusRing(settings)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Audio first')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByLabel('Reading mode')).toBeChecked()
  await page.keyboard.press('Shift+Tab')
  await expect(settings).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(entryButton).toBeFocused()
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
  const legalSummary = desk.locator('summary').first()
  await legalSummary.focus()
  await expectThreePixelFocusRing(legalSummary)
  await page.keyboard.press('Escape')
  await expect(deskTrigger).toBeFocused()
  await expect.poll(() => readProgressPosition(page)).toEqual(before)
})

test('juror-desk close resumes active audio exactly once and leaves paused audio paused', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Deterministic media lifecycle runs once.')
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __deskAudio: { utterances: string[]; cancels: number; nativePlays: number; nativePauses: number }
    }
    state.__deskAudio = { utterances: [], cancels: 0, nativePlays: 0, nativePauses: 0 }
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType(type: string) { return type.includes('opus') ? 'probably' : '' }
      load() { /* deterministic no-network audio */ }
      play() {
        state.__deskAudio.nativePlays += 1
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() {
        state.__deskAudio.nativePauses += 1
        this.dispatchEvent(new Event('pause'))
      }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    class TestUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        paused: false,
        getVoices: () => [{ lang: 'en-AU', name: 'Test voice' }],
        speak: (utterance: TestUtterance) => { state.__deskAudio.utterances.push(utterance.text) },
        cancel: () => { state.__deskAudio.cancels += 1 },
        pause() {},
        resume() {},
      },
    })
  })
  await mountRecordedAudioCourt(page)
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  const controls = page.getByLabel('Court playback controls')
  await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __deskAudio: { nativePlays: number } }
  ).__deskAudio.nativePlays)).toBe(1)
  const fixedPosition = await capturePosition(page)

  const openDesk = page.getByRole('button', { name: 'Juror desk', exact: true })
  let priorNativePauses = await page.evaluate(() => (
    window as typeof window & { __deskAudio: { nativePauses: number } }
  ).__deskAudio.nativePauses)
  for (const expectedNativePlays of [2, 3]) {
    await openDesk.click()
    const desk = page.getByRole('dialog', { name: 'Your working papers' })
    await expect(desk).toBeVisible()
    await expect(page.locator('.cw-controls button', { hasText: 'Resume' })).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __deskAudio: { nativePlays: number } }
    ).__deskAudio.nativePlays)).toBe(expectedNativePlays - 1)
    const pausesWhileOpen = await page.evaluate(() => (
      window as typeof window & { __deskAudio: { nativePauses: number } }
    ).__deskAudio.nativePauses)
    expect(pausesWhileOpen).toBeGreaterThan(priorNativePauses)
    priorNativePauses = pausesWhileOpen
    await expect.poll(() => readProgressPosition(page)).toEqual(fixedPosition)
    await desk.getByRole('button', { name: 'Close juror desk' }).click()
    await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & { __deskAudio: { nativePlays: number } }
    ).__deskAudio.nativePlays)).toBe(expectedNativePlays)
    await expect.poll(() => readProgressPosition(page)).toEqual(fixedPosition)
  }

  const lifecycle = await page.evaluate(() => (
    window as typeof window & {
      __deskAudio: { utterances: string[]; cancels: number; nativePlays: number; nativePauses: number }
    }
  ).__deskAudio)
  expect(lifecycle.nativePlays).toBe(3)
  expect(lifecycle.utterances).toEqual([])
  expect(lifecycle.nativePauses).toBeGreaterThan(0)

  await controls.getByRole('button', { name: 'Pause' }).click()
  await expect(controls.getByRole('button', { name: 'Resume' })).toBeVisible()
  await openDesk.click()
  const pausedDesk = page.getByRole('dialog', { name: 'Your working papers' })
  await pausedDesk.getByRole('button', { name: 'Close juror desk' }).click()
  await expect(controls.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __deskAudio: { nativePlays: number } }
  ).__deskAudio.nativePlays)).toBe(3)
  await expect.poll(() => readProgressPosition(page)).toEqual(fixedPosition)
})

test('mandatory contribution dialogs take and contain focus before returning it to proceedings', async ({ page }) => {
  await page.clock.install({ time: releaseNow })
  await page.goto('/')
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()

  for (let cue = 0; cue < 30; cue += 1) {
    if (await page.locator('.cw-interaction').count()) break
    await page.getByRole('button', { name: 'Continue' }).click()
  }

  const dialog = page.getByRole('dialog', { name: /Choose oath or affirmation privately/i })
  await expect(dialog).toBeVisible()
  const oath = dialog.getByRole('button', { name: 'Oath' })
  await expect(oath).toBeFocused()
  await expect(dialog.locator('.cw-choice-grid')).toBeVisible()
  await expect(page.locator('.cw-stage')).toHaveAttribute('inert', '')
  await expect(page.locator('.cw-stage')).toHaveAttribute('aria-hidden', 'true')
  await page.clock.fastForward(60_000)
  await expect(dialog.getByRole('button', { name: 'Continue proceedings' })).toBeDisabled()

  const liveCue = page.locator('.cw-cue-live-region')
  const frozenCue = (await liveCue.textContent())?.trim()
  if (!frozenCue) throw new Error('The mandatory boundary must retain a narrated cue.')
  // Progress writes are deliberately debounced. The dialog can render while
  // IndexedDB is still committing the last caption that led to this boundary,
  // so first wait for storage to match the cue already presented behind it.
  await expect.poll(async () => ({
    position: await readProgressPosition(page),
    cue: (await liveCue.textContent())?.trim(),
  })).toMatchObject({
    position: { currentCueId: firstMandatoryCueId },
    cue: frozenCue,
  })
  await expect(liveCue).toHaveText(frozenCue)
  const mandatoryPosition = await readProgressPosition(page)
  expect(mandatoryPosition).toMatchObject({ currentCueId: firstMandatoryCueId })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(oath).toBeFocused()
  await expect.poll(() => readProgressPosition(page)).toEqual(mandatoryPosition)
  await expect(liveCue).toHaveText(frozenCue)

  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Affirmation' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(oath).toBeFocused()
  await expect(page.locator('.cw-controls button:focus')).toHaveCount(0)

  await expect(liveCue).toHaveText(frozenCue)
  await oath.click()
  await expect(dialog.getByRole('button', { name: 'Continue proceedings' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Continue proceedings' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.cw-stage')).not.toHaveAttribute('inert', '')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused()
  await expect(page.locator('.cw-reading-copy')).toContainText('At 21:16 the accused heard a distress call')
  await expect(liveCue).not.toHaveText(frozenCue)
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
    await page.locator('.cw-entry__settings > summary').tap()
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
