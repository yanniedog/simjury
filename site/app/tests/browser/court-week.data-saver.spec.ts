import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function installSaveDataBrowser(page: Page) {
  await page.addInitScript((instant) => {
    Date.now = () => instant
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    })
    const state = window as typeof window & { __simjuryAudioSources: string[] }
    state.__simjuryAudioSources = []
    class TestAudio extends EventTarget {
      private value = ''
      currentTime = 0
      preload = ''
      ended = false
      get src() { return this.value }
      set src(next: string) {
        this.value = next
        if (next) state.__simjuryAudioSources.push(next)
      }
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() {
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.value = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
  }, releaseNow)
}

async function savedPosition(page: Page) {
  return page.evaluate(() => new Promise<{ currentCueId?: string; completedSessionIds: string[] } | null>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const stored = database.transaction('progress').objectStore('progress').get('cw-0001')
      stored.onerror = () => reject(stored.error)
      stored.onsuccess = () => {
        resolve((stored.result as { currentCueId?: string; completedSessionIds: string[] } | undefined) ?? null)
        database.close()
      }
    }
  }))
}

test.describe('Court Week data saver', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'network policy is exercised once')

  test('browser save-data refusal downloads no narration and preserves legal position', async ({ page }) => {
    await installSaveDataBrowser(page)
    const audioRequests: string[] = []
    page.on('request', (request) => {
      if (/\.(?:opus|m4a|mp3)(?:$|\?)/u.test(request.url())) audioRequests.push(request.url())
    })
    await page.goto('/')

    await expect(page.getByLabel('Use less data')).toBeChecked()
    await page.getByLabel('Audio and captions').check()
    await expect(page.getByLabel('Continue without recorded audio')).toBeChecked()
    await expect.poll(() => savedPosition(page)).not.toBeNull()
    const positionBeforeEntry = await savedPosition(page)
    await page.getByRole('button', { name: 'Take your seat' }).click()

    const shell = page.locator('.cw-shell')
    await expect(shell).toHaveAttribute('data-data-saver', 'true')
    await expect(shell).toHaveAttribute('data-ambience', 'off')
    await expect(page.locator('.cw-reading-copy')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Captions' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Captions' })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => (
      window as typeof window & { __simjuryAudioSources: string[] }
    ).__simjuryAudioSources)).toEqual([])
    expect(audioRequests).toEqual([])
    expect(await savedPosition(page)).toEqual(positionBeforeEntry)
    await expect(page.locator('#cw-speaker-name')).toHaveText('Court officer')
  })

  test('approval retains captions while background media remains off', async ({ page }) => {
    await installSaveDataBrowser(page)
    await page.goto('/')
    await page.getByLabel('Audio and captions').check()
    await page.getByLabel('Download recorded narration').check()
    expect(await page.evaluate(() => (
      window as typeof window & { __simjuryAudioSources: string[] }
    ).__simjuryAudioSources)).toEqual([])
    await page.getByRole('button', { name: 'Take your seat' }).click()

    await expect(page.locator('.cw-shell')).toHaveAttribute('data-access-mode', 'captions')
    await expect(page.locator('.cw-shell')).toHaveAttribute('data-ambience', 'off')
    await expect(page.locator('.cw-captions, .cw-reading-copy')).toHaveCount(1)
  })

  test('offers art-directed AVIF first for every responsive composition', async ({ page }) => {
    await installSaveDataBrowser(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Take your seat' }).click()

    const sourceSets = await page.locator('.cw-stage__picture source[type="image/avif"]').evaluateAll(
      (sources) => sources.map((source) => source.getAttribute('srcset')),
    )
    expect(sourceSets).toHaveLength(3)
    expect(sourceSets[0]).toMatch(/portrait.*\.avif/u)
    expect(sourceSets[1]).toMatch(/desktop.*\.avif/u)
    expect(sourceSets[2]).toMatch(/tablet.*\.avif/u)
  })
})
