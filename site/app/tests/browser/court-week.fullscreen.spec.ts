import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')
type FullscreenMode = 'accepted' | 'rejected' | 'unsupported'

interface FullscreenAudit {
  requestCalls: number
  exitCalls: number
  active: boolean
}

interface MediaAudit {
  playCalls: number
  pauseCalls: number
  speakCalls: number
  cancelCalls: number
}

interface ProgressPosition {
  currentSessionId?: string
  currentSceneId?: string
  currentCueId?: string
}

async function installFullscreenEnvironment(page: Page, mode: FullscreenMode) {
  await page.addInitScript(({ instant, fullscreenMode }) => {
    Date.now = () => instant
    const auditWindow = window as typeof window & {
      __simjuryFullscreenAudit: FullscreenAudit
      __simjuryMediaAudit: MediaAudit
    }
    auditWindow.__simjuryFullscreenAudit = { requestCalls: 0, exitCalls: 0, active: false }
    auditWindow.__simjuryMediaAudit = { playCalls: 0, pauseCalls: 0, speakCalls: 0, cancelCalls: 0 }

    let fullscreenNode: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenNode,
    })
    if (fullscreenMode === 'unsupported') {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
        configurable: true,
        value: undefined,
      })
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value: undefined,
      })
    } else {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
        configurable: true,
        value: async () => {
          auditWindow.__simjuryFullscreenAudit.requestCalls += 1
          if (fullscreenMode === 'rejected') throw new DOMException('Denied', 'NotAllowedError')
          fullscreenNode = document.documentElement
          auditWindow.__simjuryFullscreenAudit.active = true
          document.dispatchEvent(new Event('fullscreenchange'))
        },
      })
      Object.defineProperty(document, 'exitFullscreen', {
        configurable: true,
        value: async () => {
          auditWindow.__simjuryFullscreenAudit.exitCalls += 1
          fullscreenNode = null
          auditWindow.__simjuryFullscreenAudit.active = false
          document.dispatchEvent(new Event('fullscreenchange'))
        },
      })
    }

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
      pause() {
        auditWindow.__simjuryMediaAudit.pauseCalls += 1
        this.dispatchEvent(new Event('pause'))
      }
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
        speak: () => { auditWindow.__simjuryMediaAudit.speakCalls += 1 },
        cancel: () => { auditWindow.__simjuryMediaAudit.cancelCalls += 1 },
        pause() {},
        resume() {},
      },
    })
  }, { instant: releaseNow, fullscreenMode: mode })
}

async function readProgress(page: Page): Promise<ProgressPosition | null> {
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

async function enterCourt(page: Page, mode: FullscreenMode, askForFullscreen: boolean) {
  await installFullscreenEnvironment(page, mode)
  await page.goto('/')
  await page.getByLabel('Audio and captions').check()
  const requestOption = page.getByLabel('Ask to enter full screen')
  if (mode === 'unsupported') await expect(requestOption).toHaveCount(0)
  else if (askForFullscreen) await requestOption.check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const media = (window as typeof window & { __simjuryMediaAudit: MediaAudit }).__simjuryMediaAudit
    return media.playCalls + media.speakCalls
  })).toBe(1)
  await expect.poll(() => readProgress(page)).not.toBeNull()
}

async function captureCourtState(page: Page) {
  return {
    dayAndPhase: await page.locator('.cw-status p').first().textContent(),
    progressLabel: await page.locator('.cw-status p').nth(1).textContent(),
    speaker: await page.locator('#cw-speaker-name').textContent(),
    cue: await page.locator('[aria-live]').textContent(),
    stored: await readProgress(page),
    media: await page.evaluate(() => ({ ...(
      window as typeof window & { __simjuryMediaAudit: MediaAudit }
    ).__simjuryMediaAudit })),
  }
}

async function expectCourtState(page: Page, expected: Awaited<ReturnType<typeof captureCourtState>>) {
  await expect(page.locator('.cw-status p').first()).toHaveText(expected.dayAndPhase ?? '')
  await expect(page.locator('.cw-status p').nth(1)).toHaveText(expected.progressLabel ?? '')
  await expect(page.locator('#cw-speaker-name')).toHaveText(expected.speaker ?? '')
  await expect(page.locator('[aria-live]')).toHaveText(expected.cue ?? '')
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect.poll(() => readProgress(page)).toEqual(expected.stored)
  await expect.poll(() => page.evaluate(() => ({ ...(
    window as typeof window & { __simjuryMediaAudit: MediaAudit }
  ).__simjuryMediaAudit }))).toEqual(expected.media)
}

test('accepted native full screen and exit preserve the active court state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await enterCourt(page, 'accepted', true)
  const exitButton = page.getByRole('button', { name: 'Exit full screen' })
  await expect(exitButton).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryFullscreenAudit: FullscreenAudit }
  ).__simjuryFullscreenAudit)).toEqual({ requestCalls: 1, exitCalls: 0, active: true })
  const active = await captureCourtState(page)

  await exitButton.click()
  await expect(page.getByRole('button', { name: 'Full screen' })).toHaveAttribute('aria-pressed', 'false')
  await expectCourtState(page, active)

  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryFullscreenAudit: FullscreenAudit }
  ).__simjuryFullscreenAudit)).toEqual({ requestCalls: 2, exitCalls: 1, active: true })
  await expectCourtState(page, active)
})

test('denied native full screen remains a complete CSS-immersive court', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await enterCourt(page, 'rejected', true)
  const fullscreenButton = page.getByRole('button', { name: 'Full screen' })
  await expect(fullscreenButton).toHaveAttribute('aria-pressed', 'false')
  const active = await captureCourtState(page)

  await fullscreenButton.click()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryFullscreenAudit: FullscreenAudit }
  ).__simjuryFullscreenAudit)).toEqual({ requestCalls: 2, exitCalls: 0, active: false })
  await expectCourtState(page, active)
})

test('unsupported native full screen stays playable at phone and desktop sizes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enterCourt(page, 'unsupported', false)
  await expect(page.getByRole('button', { name: /full screen/i })).toHaveCount(0)
  const active = await captureCourtState(page)

  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport)
    const shell = await page.locator('.cw-shell').boundingBox()
    expect(shell?.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(shell?.height).toBeGreaterThanOrEqual(viewport.height - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await expectCourtState(page, active)
  }
})
