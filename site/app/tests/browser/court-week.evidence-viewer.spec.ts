import { expect, test, type Page } from '@playwright/test'
import { seedRouteAvailable } from './court-week.progress-fixture'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function enterCourt(page: Page, mode: 'Reading mode' | 'Audio and captions' = 'Reading mode') {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await seedRouteAvailable(page, releaseNow)
  await page.goto('/')
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel(mode).check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
}

async function openRoute(page: Page) {
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  await page.getByRole('button', { name: /Route diagram/i }).click()
  const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
  await expect(viewer).toBeVisible()
  return viewer
}

async function readProgressPosition(page: Page) {
  return page.evaluate(async () => new Promise<{
    currentSessionId?: string
    currentSceneId?: string
    currentCueId?: string
  } | null>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readonly')
      const get = transaction.objectStore('progress').get(['cw-0001', '2026.08.03-r2'])
      get.onerror = () => reject(get.error)
      get.onsuccess = () => {
        database.close()
        const stored = get.result as { currentSessionId?: string; currentSceneId?: string; currentCueId?: string } | undefined
        resolve(stored ? {
          currentSessionId: stored.currentSessionId,
          currentSceneId: stored.currentSceneId,
          currentCueId: stored.currentCueId,
        } : null)
      }
    }
  }))
}

test.describe('opaque evidence viewer contract', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Geometry and controls run once; the core viewer journey runs in every desktop engine.')

  for (const [device, width, height] of [
    ['compact phone', 320, 568],
    ['tablet', 768, 1024],
    ['desktop', 1280, 800],
  ] as const) {
    test(`${device} exposes the same vector source and every button-operated transform`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await enterCourt(page)
      const viewer = await openRoute(page)
      const document = viewer.locator('.cw-evidence-document')

      await expect(document).toHaveAttribute('data-inspection-source', 'structured-vector')
      await expect(document.locator('svg')).toHaveAttribute('viewBox', '0 0 800 500')
      const surface = await viewer.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {
          width: box.width,
          height: box.height,
          background: getComputedStyle(element).backgroundColor,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
        }
      })
      expect(surface.width).toBeGreaterThanOrEqual(surface.viewportWidth - 34)
      expect(surface.height).toBeGreaterThanOrEqual(surface.viewportHeight - 34)
      expect(surface.background).not.toBe('rgba(0, 0, 0, 0)')

      const actions = [
        ['Zoom in', /scale\(1\.2\)/],
        ['Zoom out', /scale\(1\)/],
        ['Move exhibit left', /translate\(-24px, 0px\)/],
        ['Move exhibit right', /translate\(0px, 0px\)/],
        ['Move exhibit up', /translate\(0px, -24px\)/],
        ['Move exhibit down', /translate\(0px, 0px\)/],
      ] as const
      for (const [name, transform] of actions) {
        const button = viewer.getByRole('button', { name })
        await expect(button).toBeVisible()
        expect(await button.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return Math.min(box.width, box.height)
        })).toBeGreaterThanOrEqual(44)
        await button.click()
        await expect(document).toHaveAttribute('style', transform)
      }
      await viewer.getByRole('button', { name: 'Reset' }).click()
      await expect(document).toHaveAttribute('style', /translate\(0px, 0px\) scale\(1\)/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    })
  }
})

test('closing focused inspection resumes an active cue from its boundary', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Deterministic media lifecycle runs once.')
  await page.addInitScript(() => {
    const state = window as typeof window & { __evidenceSpeech: { utterances: string[]; cancels: number } }
    state.__evidenceSpeech = { utterances: [], cancels: 0 }
    class TestUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    // This test owns the device-speech interruption path. Pinned production
    // cues now carry recorded MP3, so remove Audio rather than pretending the
    // format is unsupported (MP3 remains the deliberate compatibility fallback).
    Object.defineProperty(window, 'Audio', { configurable: true, value: undefined })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        paused: false,
        getVoices: () => [{ lang: 'en-AU', name: 'Test voice' }],
        speak: (utterance: TestUtterance) => { state.__evidenceSpeech.utterances.push(utterance.text) },
        cancel: () => { state.__evidenceSpeech.cancels += 1 },
        pause() {},
        resume() {},
      },
    })
  })
  await enterCourt(page, 'Audio and captions')
  await expect(page.getByLabel('Court playback controls').getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => readProgressPosition(page)).not.toBeNull()
  const progressBefore = await readProgressPosition(page)
  const viewer = await openRoute(page)
  // The playback controls are intentionally outside the accessibility tree
  // while the modal viewer is open, but their paused state must still update.
  await expect(page.locator('.cw-controls button', { hasText: 'Resume' })).toHaveCount(1)
  await viewer.getByRole('button', { name: 'Close exhibit' }).click()
  await page.getByRole('button', { name: 'Close juror desk' }).click()
  await expect(page.getByLabel('Court playback controls').getByRole('button', { name: 'Pause' })).toBeVisible()
  const lifecycle = await page.evaluate(() => (window as typeof window & {
    __evidenceSpeech: { utterances: string[]; cancels: number }
  }).__evidenceSpeech)
  expect(lifecycle.utterances).toHaveLength(2)
  expect(lifecycle.utterances[1]).toBe(lifecycle.utterances[0])
  expect(lifecycle.cancels).toBeGreaterThan(0)
  expect(await readProgressPosition(page)).toEqual(progressBefore)
})
