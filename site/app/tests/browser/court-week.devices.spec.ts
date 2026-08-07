import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
const tabletProjects = new Set(['ipad-safari', 'android-tablet'])
const expectedUserAgent: Record<string, RegExp> = {
  'iphone-safari': /iPhone.*Safari/u,
  'android-phone': /Android.*Mobile Safari/u,
  'ipad-safari': /iPad.*Safari/u,
  'android-tablet': /Android(?!.*Mobile).*Safari/u,
}
const expectedBrowser: Record<string, 'chromium' | 'webkit'> = {
  'iphone-safari': 'webkit',
  'android-phone': 'chromium',
  'ipad-safari': 'webkit',
  'android-tablet': 'chromium',
}

interface MediaAuditState {
  playCalls: number
  speakCalls: number
  cancelCalls: number
  lastUtterance: string
}

interface ProgressPosition {
  currentSessionId?: string
  currentSceneId?: string
  currentCueId?: string
}

async function installDeterministicPlayback(page: Page) {
  await page.addInitScript((instant) => {
    Date.now = () => instant
    const auditWindow = window as typeof window & { __simjuryMediaAudit: MediaAuditState }
    auditWindow.__simjuryMediaAudit = { playCalls: 0, speakCalls: 0, cancelCalls: 0, lastUtterance: '' }
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() {
        auditWindow.__simjuryMediaAudit.playCalls += 1
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.dispatchEvent(new Event('pause')) }
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
        speak: (utterance: TestUtterance) => {
          auditWindow.__simjuryMediaAudit.speakCalls += 1
          auditWindow.__simjuryMediaAudit.lastUtterance = utterance.text
        },
        cancel: () => { auditWindow.__simjuryMediaAudit.cancelCalls += 1 },
        pause() {},
        resume() {},
      },
    })
  }, releaseNow)
}

async function enterActiveCourt(page: Page) {
  await installDeterministicPlayback(page)
  await page.goto('/')
  await page.locator('.cw-entry__settings > summary').tap()
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).tap()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryMediaAudit: MediaAuditState }
  ).__simjuryMediaAudit.playCalls)).toBe(1)
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryMediaAudit: MediaAuditState }
  ).__simjuryMediaAudit.speakCalls)).toBe(0)
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

async function captureActiveState(page: Page) {
  await expect.poll(() => readProgressPosition(page)).not.toBeNull()
  return {
    cue: await page.locator('.cw-cue-live-region').textContent(),
    speaker: await page.locator('#cw-speaker-name').textContent(),
    progressLabel: await page.locator('.cw-status p').nth(1).textContent(),
    stored: await readProgressPosition(page),
    media: await page.evaluate(() => ({ ...(
      window as typeof window & { __simjuryMediaAudit: MediaAuditState }
    ).__simjuryMediaAudit })),
  }
}

async function expectActiveState(page: Page, expected: Awaited<ReturnType<typeof captureActiveState>>) {
  await expect(page.locator('.cw-cue-live-region')).toHaveText(expected.cue ?? '')
  await expect(page.locator('#cw-speaker-name')).toHaveText(expected.speaker ?? '')
  await expect(page.locator('.cw-status p').nth(1)).toHaveText(expected.progressLabel ?? '')
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => readProgressPosition(page)).toEqual(expected.stored)
  await expect.poll(() => page.evaluate(() => ({ ...(
    window as typeof window & { __simjuryMediaAudit: MediaAuditState }
  ).__simjuryMediaAudit }))).toEqual(expected.media)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
}

test('Android phone entry presents its primary action without a touch swipe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-phone', 'The Android Chromium project owns compact-entry coverage.')
  await page.setViewportSize({ width: 412, height: 700 })
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await page.goto('/')

  const entry = page.locator('.cw-entry')
  const heading = page.getByRole('heading', { name: 'Eleven Minutes' })
  const takeSeat = page.getByRole('button', { name: 'Take your seat' })
  const layout = await entry.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1)
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  await expect(heading).toBeInViewport()
  await expect(takeSeat).toBeInViewport()
})

test('real device context preserves active playback through portrait-to-landscape rotation', async ({ browserName, page }, testInfo) => {
  await enterActiveCourt(page)
  const capabilities = await page.evaluate(() => ({
    devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  }))
  expect(browserName).toBe(expectedBrowser[testInfo.project.name])
  expect(testInfo.project.use.hasTouch).toBe(true)
  expect(testInfo.project.use.isMobile).toBe(true)
  expect(capabilities.devicePixelRatio).toBeGreaterThan(1)
  // Desktop-hosted WebKit reports zero here even when its device descriptor has
  // touch enabled; the successful Take-your-seat tap above is the portable proof.
  if (testInfo.project.name.startsWith('android')) {
    expect(capabilities.maxTouchPoints).toBeGreaterThan(0)
  }
  expect(capabilities.userAgent).toMatch(expectedUserAgent[testInfo.project.name])
  const portrait = page.viewportSize()
  expect(portrait).not.toBeNull()
  expect(portrait!.height).toBeGreaterThan(portrait!.width)
  const active = await captureActiveState(page)

  await page.setViewportSize({ width: portrait!.height, height: portrait!.width })
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')))

  await expectActiveState(page, active)
})

test('tablet split resize at 500 and 700 pixels preserves active playback', async ({ page }, testInfo) => {
  test.skip(!tabletProjects.has(testInfo.project.name), 'Tablet projects own split-screen coverage.')
  await enterActiveCourt(page)
  const active = await captureActiveState(page)

  for (const width of [500, 700]) {
    await page.setViewportSize({ width, height: 900 })
    await expectActiveState(page, active)
  }
})
