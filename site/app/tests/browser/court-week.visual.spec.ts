import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
const screenshotStyle = fileURLToPath(new URL('./court-week.visual.css', import.meta.url))

const viewports = [
  { name: 'compact-phone', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

type CourtPosition = {
  sceneId: 'mon-arrival' | 'mon-orr-chief' | 'mon-elements'
  cueId: 'mon-arrival-1' | 'mon-orr-chief-1' | 'mon-elements-1'
}

async function installDeterministicCourt(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript((instant) => {
    Date.now = () => instant
    localStorage.setItem('simjury:court-week:local-profile:v1', JSON.stringify({
      schemaVersion: 'simjury-local-profile-v1',
      jurorLabel: 'Juror 01',
      adultFictionAcknowledged: true,
    }))
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* reading mode performs no media fetch */ }
      play() { return Promise.resolve() }
      pause() { /* deterministic no-op */ }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
  }, releaseNow)
}

async function seedPosition(page: Page, position: CourtPosition) {
  await page.goto('/robots.txt')
  await page.evaluate(async ({ instant, sceneId, cueId }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('progress')) {
        request.result.createObjectStore('progress')
      }
    }
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.objectStore('progress').put({
        schemaVersion: 'court-week-progress-v1',
        courtWeekId: 'cw-0001',
        revision: '2026.08.03-r2',
        highestObservedTime: new Date(instant).toISOString(),
        completedSessionIds: [],
        currentSessionId: 'cw-0001-monday',
        currentSceneId: sceneId,
        currentCueId: cueId,
        notes: '',
        reasoningContributions: [],
        majorityDirectionReceived: false,
        accessibilityMode: 'reading',
      }, ['cw-0001', '2026.08.03-r2'])
    }
  }), { instant: releaseNow, ...position })
}

async function enterCourt(page: Page, position: CourtPosition) {
  await installDeterministicCourt(page)
  await seedPosition(page, position)
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  await expect(page.locator('#cw-speaker-name')).toHaveText(
    position.sceneId === 'mon-arrival' ? 'Court officer'
      : position.sceneId === 'mon-elements' ? 'Judge Sel Aven' : 'Nella Orr',
  )
  await page.locator('.cw-stage__picture img').evaluate(async (image: HTMLImageElement) => {
    if (!image.complete) await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
    await image.decode().catch(() => undefined)
  })
  await page.evaluate(async () => {
    await document.fonts.ready
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
}

async function expectVisual(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1)
  await expect(page).toHaveScreenshot(`${name}.webp`, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015,
    threshold: 0.25,
    stylePath: screenshotStyle,
  })
}

test.describe('Court Week visual contract', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'One pinned Chromium rasterizer owns visual baselines.')
  test.beforeEach(({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium')
    // Keep each checked baseline tied to its runner rasterizer. This avoids
    // loosening pixel tolerance enough to hide real layout regressions.
    testInfo.snapshotSuffix = process.platform
  })

  for (const viewport of viewports) {
    test(`${viewport.name}: session opening`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await enterCourt(page, { sceneId: 'mon-arrival', cueId: 'mon-arrival-1' })
      await expect(page.locator('#cw-speaker-name')).toHaveText('Court officer')
      await expectVisual(page, `${viewport.name}-session-opening`)
    })

    test(`${viewport.name}: active testimony`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await enterCourt(page, { sceneId: 'mon-orr-chief', cueId: 'mon-orr-chief-1' })
      await expect(page.locator('#cw-speaker-name')).toHaveText('Nella Orr')
      await expectVisual(page, `${viewport.name}-active-testimony`)
    })

    test(`${viewport.name}: juror desk`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await enterCourt(page, { sceneId: 'mon-orr-chief', cueId: 'mon-orr-chief-1' })
      await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'Your working papers' })).toBeVisible()
      await expectVisual(page, `${viewport.name}-juror-desk`)
    })

    test(`${viewport.name}: admitted evidence viewer`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await enterCourt(page, { sceneId: 'mon-elements', cueId: 'mon-elements-1' })
      await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
      await page.getByRole('button', { name: /Route diagram/i }).click()
      const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
      await expect(viewer).toBeVisible()
      await expect(viewer.locator('.cw-exhibit--route svg')).toBeVisible()
      await expectVisual(page, `${viewport.name}-evidence-viewer`)
    })
  }
})
