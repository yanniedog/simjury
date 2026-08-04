import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function prepareCourt(page: Page) {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await page.goto('/')
}

test('caption assistive copy exposes the complete visible cue exactly once', async ({ page }) => {
  await page.addInitScript((instant) => {
    Date.now = () => instant
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() { this.dispatchEvent(new Event('playing')); return Promise.resolve() }
      pause() { this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
    class TestUtterance {
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        paused: false,
        getVoices: () => [{ lang: 'en-AU', name: 'Test voice' }],
        speak() {}, cancel() {}, pause() {}, resume() {},
      },
    })
  }, releaseNow)
  await page.goto('/robots.txt')
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore('progress')
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.objectStore('progress').put({
        schemaVersion: 'court-week-progress-v1',
        courtWeekId: 'cw-0001',
        revision: '2026.08.03-r1',
        highestObservedTime: '2026-08-17T09:00:00+10:00',
        completedSessionIds: ['cw-0001-monday', 'cw-0001-tuesday'],
        currentSessionId: 'cw-0001-wednesday',
        currentSceneId: 'wed-adjourn',
        currentCueId: 'wed-adjourn-2',
        notes: '',
        reasoningContributions: [],
        accessibilityMode: 'captions',
        majorityDirectionReceived: false,
      }, 'cw-0001')
    }
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()

  const visibleCue = page.locator('.cw-captions span')
  const liveCue = page.locator('.cw-cue-live-region')
  await expect(visibleCue).toBeVisible()
  await expect(liveCue).toHaveAttribute('aria-live', 'polite')
  await expect(liveCue).toHaveText(`Court officer: ${await visibleCue.textContent()}`)
  await expect(visibleCue.locator('xpath=..')).toHaveAttribute('aria-hidden', 'true')
})

test('labelled entry and desk controls retain a 44px effective touch target', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await prepareCourt(page)

  const undersized: Array<{ label: string; height: number }> = []
  for (const label of ['Audio first', 'Audio and captions', 'Reading mode', 'Use less data', 'Ask to enter full screen']) {
    const input = page.getByLabel(label)
    if (await input.count()) {
      const target = input.locator('xpath=ancestor::label')
      const height = (await target.boundingBox())?.height ?? 0
      if (height < 44) undersized.push({ label, height })
    }
  }

  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  const exportNotes = page.getByLabel('Include my private notes in the export')
  const exportHeight = (await exportNotes.locator('xpath=ancestor::label').boundingBox())?.height ?? 0
  if (exportHeight < 44) undersized.push({ label: 'Include my private notes in the export', height: exportHeight })
  for (const summary of await page.getByRole('dialog', { name: 'Your working papers' }).locator('summary').all()) {
    const height = (await summary.boundingBox())?.height ?? 0
    if (height < 44) undersized.push({ label: (await summary.textContent()) ?? 'summary', height })
  }
  expect(undersized).toEqual([])
})

test('200% text enlargement keeps reading copy and every core control usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await prepareCourt(page)
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })

  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  for (const name of ['Play', 'Repeat', 'Captions', 'Juror desk', 'Full screen', 'Continue']) {
    const control = page.getByRole('button', { name, exact: true })
    if (await control.count()) {
      await control.scrollIntoViewIfNeeded()
      await expect(control).toBeVisible()
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})
