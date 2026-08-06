import { expect, test, type Page } from '@playwright/test'
import { elevenMinutesSessions } from '../../src/courtweek/content/sessions'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function enterCourt(page: Page) {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  const prohibited: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^wss?:/.test(url.protocol) || /\/(api|workers?|d1|durable-object|ai)(\/|$)/i.test(url.pathname) || url.hostname === 'api.github.com') {
      prohibited.push(request.url())
    }
  })
  await page.goto('/')
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.getByText('Monday', { exact: false }).first()).toBeVisible()
  return prohibited
}

const viewports = [
  [320, 568], [360, 800], [390, 844], [412, 915], [844, 390], [915, 412],
  [768, 1024], [820, 1180], [1024, 768], [1180, 820], [500, 900], [700, 900],
  [1280, 800], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
] as const

test('local developer mode remains reachable at a 200% compact-phone reflow', async ({ page }) => {
  await page.setViewportSize({ width: 160, height: 284 })
  await page.addInitScript(() => localStorage.removeItem('simjury:court-week:local-profile:v1'))
  await page.goto('/')
  const surface = page.locator('.cw-entry__panel')
  await expect(page.getByRole('button', { name: 'Take your seat' })).toBeDisabled()
  await page.getByLabel('I am 18 or older and understand this case is fictional.').check()
  await page.getByLabel('Developer mode').check()
  const submit = page.getByRole('button', { name: 'Open all-session preview' })
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeVisible()
  expect(await surface.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
    && document.body.scrollWidth <= window.innerWidth)).toBe(true)
  await submit.focus()
  await expect(submit).toBeFocused()
  await expect(submit).toBeVisible()
})

test('local profile label controls stay inside their card at supported reflow widths', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('simjury:court-week:local-profile:v1'))

  for (const [width, height] of [[160, 284], [390, 844], [820, 1180], [1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/')

    const containment = await page.locator('.cw-local-profile').evaluate((profile) => {
      const body = profile.querySelector<HTMLElement>('.cw-local-profile__body')
      const row = profile.querySelector<HTMLElement>('.cw-local-profile__label-row')
      const save = row?.querySelector<HTMLButtonElement>('button')
      if (!body || !row || !save) throw new Error('Local profile label controls are missing.')
      const rowRect = row.getBoundingClientRect()
      const saveRect = save.getBoundingClientRect()
      return {
        profileContained: profile.scrollWidth <= profile.clientWidth,
        bodyContained: body.scrollWidth <= body.clientWidth,
        rowContained: row.scrollWidth <= row.clientWidth,
        saveContained: saveRect.left >= rowRect.left - 0.5 && saveRect.right <= rowRect.right + 0.5,
        saveWidth: saveRect.width,
        saveHeight: saveRect.height,
      }
    })

    expect(containment, `${width}x${height} profile containment`).toMatchObject({
      profileContained: true,
      bodyContained: true,
      rowContained: true,
      saveContained: true,
    })
    expect(containment.saveWidth).toBeGreaterThanOrEqual(44)
    expect(containment.saveHeight).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  }
})

test('Take your seat starts the first cue exactly once', async ({ page }) => {
  await page.addInitScript((instant) => {
    Date.now = () => instant
    const mediaState = window as typeof window & { __simjuryPlayCalls: number; __simjurySpeechCalls: number }
    mediaState.__simjuryPlayCalls = 0
    mediaState.__simjurySpeechCalls = 0
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() {
        mediaState.__simjuryPlayCalls += 1
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
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
        speak: () => { mediaState.__simjurySpeechCalls += 1 },
        cancel() {},
        pause() {},
        resume() {},
      },
    })
  }, releaseNow)
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()

  await expect.poll(() => page.evaluate(
    () => (window as typeof window & { __simjuryPlayCalls: number }).__simjuryPlayCalls,
  )).toBe(1)
  expect(await page.evaluate(
    () => (window as typeof window & { __simjurySpeechCalls: number }).__simjurySpeechCalls,
  )).toBe(0)
})

test.describe('responsive Court Week shell', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'full viewport matrix runs once')

  for (const [width, height] of viewports) {
    for (const zoom of [1, 2]) {
      test(`${width}x${height} at ${zoom * 100}%`, async ({ page }, testInfo) => {
        // Browser zoom reduces the layout viewport; emulate that reflow without
        // CSS `zoom`, which scales fixed-position boxes without browser reflow.
        await page.setViewportSize({ width: Math.floor(width / zoom), height: Math.floor(height / zoom) })
        const prohibited = await enterCourt(page)
        await expect(page.getByRole('button', { name: 'Juror desk', exact: true })).toBeVisible()
        if (width === 320 && height === 568 && zoom === 2) {
          await expect(page.locator('.cw-status')).toBeVisible()
          await expect(page.locator('.cw-reading-copy')).toBeVisible()
          const continueButton = page.getByRole('button', { name: 'Continue' })
          await continueButton.scrollIntoViewIfNeeded()
          await expect(continueButton).toBeVisible()
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
        expect(prohibited).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`court-${width}x${height}-${zoom * 100}.png`) })
      })
    }
  }
})

test('does not request sealed packs or unlock chunks before court time', async ({ page }) => {
  await page.addInitScript(() => {
    Date.now = () => Date.parse('2026-08-10T08:29:59+10:00')
  })
  const sealedRequests: string[] = []
  page.on('request', (request) => {
    if (/\.sjp(?:$|\?)|court-week-media-manifest|\/releases\/download\/|\/(?:unlockKey|day0[1-7])-[^/]+\.js(?:$|\?)/u.test(request.url())) {
      sealedRequests.push(request.url())
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Eleven Minutes' })).toBeVisible()
  await page.waitForTimeout(250)
  expect(sealedRequests).toEqual([])
})

test('core flow remains playable across browser engines', async ({ page }) => {
  const prohibited = await enterCourt(page)
  await page.getByRole('button', { name: 'Juror desk' }).click()
  await expect(page.getByRole('dialog', { name: 'Your working papers' })).toBeVisible()
  await page.getByRole('button', { name: /Route diagram/i }).click()
  await expect(page.getByRole('dialog', { name: /Route diagram/i })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByRole('button', { name: 'Close exhibit' }).click()
  await page.getByRole('button', { name: 'Close juror desk' }).click()
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('button', { name: 'Juror desk', exact: true })).toBeVisible()
  expect(prohibited).toEqual([])
})

test('the juror desk exposes no struck material or inspection route', async ({ page }) => {
  await enterCourt(page)
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  await expect(desk.getByText('Struck workplace rumour')).toHaveCount(0)
  await expect(desk.getByText('This material is legally absent and must not be used for any purpose.')).toHaveCount(0)
  await expect(desk.getByRole('button', { name: /struck/i })).toHaveCount(0)
})

test('the juror desk traps keyboard focus and restores its trigger', async ({ page }) => {
  await enterCourt(page)
  const trigger = page.getByRole('button', { name: 'Juror desk', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')

  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  const close = desk.getByRole('button', { name: 'Close juror desk' })
  const lastVisibleControl = desk.getByRole('button', { name: 'Import progress' })
  await expect(close).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(lastVisibleControl).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(desk).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test.describe('device-sized admitted exhibit viewer', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'device matrix runs once')

  for (const [device, width, height] of [
    ['phone', 320, 568],
    ['tablet', 768, 1024],
    ['desktop', 1280, 800],
  ] as const) {
    for (const zoom of [1, 2]) {
      test(`${device} at ${zoom * 100}% zoom`, async ({ page }) => {
        await page.setViewportSize({ width: Math.floor(width / zoom), height: Math.floor(height / zoom) })
        const prohibited = await enterCourt(page)
        await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
        await page.getByRole('button', { name: /Route diagram/i }).click()
        const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
        await expect(viewer).toBeVisible()
        await expect(viewer.getByLabel('Exhibit viewing controls')).toBeVisible()
        await expect(viewer.locator('.cw-exhibit--route svg')).toBeVisible()
        await expect(viewer.getByText('The diagram establishes distance and route only, not conditions or outcome.')).toBeVisible()
        await viewer.getByRole('button', { name: 'Zoom in' }).click()
        await viewer.getByRole('button', { name: 'Move exhibit right' }).click()
        await expect(viewer.locator('.cw-evidence-document')).toHaveAttribute('style', /translate\(24px, 0px\) scale\(1\.2\)/)
        await viewer.getByRole('button', { name: 'Reset' }).click()
        await expect(viewer.locator('.cw-evidence-document')).toHaveAttribute('style', /translate\(0px, 0px\) scale\(1\)/)
        await viewer.getByText('Evidence foundation').click()
        await expect(viewer.getByText(/Prepared from the service chart/)).toBeVisible()
        await expect(viewer.getByText('Not proof of visibility, sea state or survival time')).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
        expect(prohibited).toEqual([])
      })
    }
  }
})

test('exhibit viewer survives 200% phone reflow without clipping controls', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Responsive geometry is exercised once.')
  await page.setViewportSize({ width: 160, height: 284 })
  await enterCourt(page)
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  await page.getByRole('button', { name: /Route diagram/i }).click()
  const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
  const close = viewer.getByRole('button', { name: 'Close exhibit' })
  await expect(viewer).toBeVisible()
  await expect(close).toBeVisible()
  const geometry = await viewer.evaluate((element) => {
    const viewerBox = element.getBoundingClientRect()
    const closeBox = element.querySelector<HTMLElement>('[aria-label="Close exhibit"]')!.getBoundingClientRect()
    return {
      internalOverflow: element.scrollWidth - element.clientWidth,
      closeInsideViewer: closeBox.left >= viewerBox.left && closeBox.right <= viewerBox.right,
      closeInsideViewport: closeBox.left >= 0 && closeBox.right <= document.documentElement.clientWidth,
    }
  })
  expect(geometry).toEqual({ internalOverflow: 0, closeInsideViewer: true, closeInsideViewport: true })
})

test('exhibit viewer traps focus and restores the exact inspection trigger', async ({ page }) => {
  await enterCourt(page)
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  const trigger = desk
    .getByRole('button', { name: /Route diagram/i })
  const originalTrigger = await trigger.elementHandle()
  expect(originalTrigger).not.toBeNull()

  await trigger.focus()
  await page.keyboard.press('Enter')
  const viewer = page.getByRole('dialog', { name: /Harbour route diagram/i })
  const close = viewer.getByRole('button', { name: 'Close exhibit' })
  const lastFocusable = viewer.getByText('Evidence foundation')
  await expect(close).toBeFocused()
  await expect(page.locator('.cw-desk')).toHaveAttribute('inert', '')

  await page.keyboard.press('Shift+Tab')
  await expect(lastFocusable).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(desk).not.toHaveAttribute('inert', '')
  expect(await originalTrigger!.evaluate((element) => element.isConnected && document.activeElement === element)).toBe(true)

  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await expect(close).toBeFocused()
})

async function seedTuesdayPosition(
  page: Page,
  currentSceneId: string,
  currentCueId: string,
  accessibilityMode: 'audio-first' | 'captions' | 'reading' = 'audio-first',
) {
  await page.goto('/robots.txt')
  await page.evaluate(async ({ instant, currentSceneId, currentCueId, accessibilityMode }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.objectStore('progress').put({
        schemaVersion: 'court-week-progress-v1',
        courtWeekId: 'cw-0001',
        revision: '2026.08.03-r2',
        highestObservedTime: new Date(instant).toISOString(),
        completedSessionIds: ['cw-0001-monday'],
        currentSessionId: 'cw-0001-tuesday',
        currentSceneId,
        currentCueId,
        notes: '',
        accessibilityMode,
        reasoningContributions: [],
        majorityDirectionReceived: false,
      }, 'cw-0001')
    }
  }), { instant: releaseNow, currentSceneId, currentCueId, accessibilityMode })
}

test('recording replay stays sealed until its final admission has been heard', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The cue-level legal gate is exercised once.')
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await seedTuesdayPosition(page, 'tue-resume', 'tue-resume-1', 'reading')
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  await page.getByRole('button', { name: 'Distress recording' }).click()
  const viewer = page.getByRole('dialog', { name: 'Distress recording' })
  await expect(viewer.getByRole('button', { name: 'Replay admitted recording' })).toHaveCount(0)
  await expect(viewer.getByText('Admitted recording', { exact: true })).toHaveCount(0)
})

test('admitted recording replay keeps its legal direction, captions and compact-device controls together', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Deterministic compact geometry and speech fallback are exercised once.')
  await page.setViewportSize({ width: 160, height: 284 })
  await page.addInitScript((instant) => {
    Date.now = () => instant
    const mediaState = window as typeof window & {
      __simjuryReplaySpeech: string[]
      __simjuryReplayVoices: string[]
      __simjuryReplayCancels: number
      __simjuryEndReplayTurn: () => void
    }
    mediaState.__simjuryReplaySpeech = []
    mediaState.__simjuryReplayVoices = []
    mediaState.__simjuryReplayCancels = 0
    let currentUtterance: TestUtterance | null = null
    class FailedRecording extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic retry */ }
      play() { return Promise.reject(new Error('Recording unavailable')) }
      pause() { /* the failed recording never starts */ }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: FailedRecording })
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
        getVoices: () => [
          { lang: 'en-AU', name: 'Test voice 1', voiceURI: 'test-voice-1' },
          { lang: 'en-AU', name: 'Test voice 2', voiceURI: 'test-voice-2' },
          { lang: 'en-AU', name: 'Test voice 3', voiceURI: 'test-voice-3' },
          { lang: 'en-AU', name: 'Test voice 4', voiceURI: 'test-voice-4' },
        ],
        speak: (utterance: TestUtterance) => {
          currentUtterance = utterance
          mediaState.__simjuryReplaySpeech.push(utterance.text)
          mediaState.__simjuryReplayVoices.push(utterance.voice?.voiceURI ?? '')
        },
        cancel: () => { mediaState.__simjuryReplayCancels += 1 },
        pause() {},
        resume() {},
      },
    })
    mediaState.__simjuryEndReplayTurn = () => currentUtterance?.onend?.()
  }, releaseNow)
  await seedTuesdayPosition(page, 'tue-adjourn', 'tue-adjourn-1')

  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  const trigger = desk.getByRole('button', { name: 'Distress recording' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const viewer = page.getByRole('dialog', { name: 'Distress recording' })
  const replay = viewer.getByRole('button', { name: 'Replay admitted recording' })
  await expect(viewer.getByText(/Repetition does not give it extra legal weight/)).toBeVisible()
  await replay.scrollIntoViewIfNeeded()
  const target = await replay.boundingBox()
  expect(target?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(target?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await viewer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

  await page.evaluate(() => {
    (window as typeof window & { __simjuryReplaySpeech: string[] }).__simjuryReplaySpeech = []
  })
  await replay.focus()
  await page.keyboard.press('Enter')
  await expect(viewer.getByRole('button', { name: 'Pause admitted recording' })).toBeVisible()
  await expect(viewer.locator('.cw-recording-caption')).toContainText('Lumen to Reach control')
  await expect(viewer.locator('.cw-visually-hidden[aria-live="polite"]')).toContainText(/Ilan Saye.*Lumen to Reach control/)
  const captionGeometry = await viewer.locator('.cw-recording-caption').evaluate((caption) => ({
    clientHeight: caption.clientHeight,
    scrollHeight: caption.scrollHeight,
  }))
  expect(captionGeometry.scrollHeight).toBeLessThanOrEqual(captionGeometry.clientHeight + 1)
  expect((await page.evaluate(() => (
    window as typeof window & { __simjuryReplaySpeech: string[] }
  ).__simjuryReplaySpeech))[0]).toContain('Lumen to Reach control. Flooding fast.')
  await page.evaluate(() => (
    window as typeof window & { __simjuryEndReplayTurn: () => void }
  ).__simjuryEndReplayTurn())
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryReplaySpeech: string[] }
  ).__simjuryReplaySpeech.length)).toBeGreaterThan(1)
  expect((await page.evaluate(() => (
    window as typeof window & { __simjuryReplaySpeech: string[] }
  ).__simjuryReplaySpeech))[1]).toContain('Beacon Alpha-Romeo seven-one')
  const firstSpeakerVoices = await page.evaluate(() => (
    window as typeof window & { __simjuryReplayVoices: string[] }
  ).__simjuryReplayVoices.slice(0, 2))
  expect(firstSpeakerVoices).toHaveLength(2)
  expect(firstSpeakerVoices.every((voice) => /^test-voice-/u.test(voice))).toBe(true)
  expect(await page.evaluate(() => (
    window as typeof window & { __simjuryReplayVoices: string[] }
  ).__simjuryReplayVoices[1])).not.toBe(await page.evaluate(() => (
    window as typeof window & { __simjuryReplayVoices: string[] }
  ).__simjuryReplayVoices[0]))
  await page.keyboard.press('Space')
  await expect(viewer.getByRole('button', { name: 'Resume admitted recording' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(viewer.getByRole('button', { name: 'Pause admitted recording' })).toBeVisible()
  const cancelsBeforeClose = await page.evaluate(() => (
    window as typeof window & { __simjuryReplayCancels: number }
  ).__simjuryReplayCancels)
  await viewer.getByRole('button', { name: 'Close exhibit' }).click()
  await expect(viewer).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __simjuryReplayCancels: number }
  ).__simjuryReplayCancels)).toBeGreaterThan(cancelsBeforeClose)

  await page.evaluate(() => { window.speechSynthesis.getVoices = () => [] })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const fallbackViewer = page.getByRole('dialog', { name: 'Distress recording' })
  const fallbackReplay = fallbackViewer.getByRole('button', { name: 'Replay admitted recording' })
  await fallbackReplay.focus()
  await page.keyboard.press('Enter')
  const fallbackCopy = fallbackViewer.locator('.cw-recording-caption')
  await expect(fallbackViewer.getByText('Audio is unavailable. Reading mode is ready.')).toBeVisible()
  await expect(fallbackCopy).toContainText('Transmission breaks')
  await expect(fallbackCopy).toHaveAttribute('data-expanded', 'true')
})

test('scene safe regions reflow caption lanes through phone, tablet, desktop and 200% zoom', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Responsive geometry is exercised once; cross-engine flow remains separate.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript((instant) => {
    Date.now = () => instant
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() {
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
  }, releaseNow)
  await page.goto('/')
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'cw-captions cw-caption-probe'
    probe.style.visibility = 'visible'
    const copy = document.createElement('span')
    copy.textContent = 'A short caption used to verify the authored safe lane.'
    probe.append(copy)
    document.querySelector('.cw-stage')?.append(probe)
  })

  const directions = elevenMinutesSessions[0].scenes.find(({ id }) => id === 'mon-arrival')!.visual.compositionArt!
  const geometry = async (safe: { x: number; y: number; width: number; height: number }) => page.locator('.cw-caption-probe').evaluate((caption, safeRegion) => {
    const stage = caption.closest('.cw-stage')!.getBoundingClientRect()
    const box = caption.getBoundingClientRect()
    const protectedBox = {
      left: stage.left + stage.width * safeRegion.x / 100,
      top: stage.top + stage.height * safeRegion.y / 100,
      right: stage.left + stage.width * (safeRegion.x + safeRegion.width) / 100,
      bottom: stage.top + stage.height * (safeRegion.y + safeRegion.height) / 100,
    }
    const intersection = Math.max(0, Math.min(box.right, protectedBox.right) - Math.max(box.left, protectedBox.left)) *
      Math.max(0, Math.min(box.bottom, protectedBox.bottom) - Math.max(box.top, protectedBox.top))
    return { widthRatio: box.width / stage.width, intersection, top: box.top, bottom: box.bottom }
  }, safe)

  const phone = await geometry(directions.portrait.subjectSafeRegion!)
  expect(phone.intersection).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 844, height: 390 })
  const landscape = await geometry(directions.desktop.subjectSafeRegion!)
  expect(landscape.intersection).toBeLessThanOrEqual(1)
  expect(landscape.widthRatio).toBeLessThan(phone.widthRatio)
  await page.setViewportSize({ width: 820, height: 1180 })
  expect((await geometry(directions.tablet.subjectSafeRegion!)).intersection).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 1280, height: 800 })
  expect((await geometry(directions.desktop.subjectSafeRegion!)).intersection).toBeLessThanOrEqual(1)

  // A 390px browser at 200% has an approximately 195px layout viewport.
  await page.setViewportSize({ width: 195, height: 422 })
  await expect(page.locator('.cw-caption-probe')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('caption runtime uses line fit and collision-free fallback at reported viewports', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Deterministic geometry is exercised once; cross-engine journeys remain separate.')
  await page.addInitScript((instant) => {
    Date.now = () => instant
    class TestAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* deterministic no-network audio */ }
      play() {
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: TestAudio })
    class TestUtterance extends EventTarget {
      text: string
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) { super(); this.text = text }
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
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()

  const layouts = [
    { name: '320x568', width: 320, height: 568 },
    { name: '844x390', width: 844, height: 390 },
    { name: 'split-500', width: 500, height: 900 },
    { name: 'split-700', width: 700, height: 900 },
    { name: '1440x900 at 200% reflow', width: 720, height: 450 },
  ]
  for (const layout of layouts) {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    await expect(page.locator('.cw-shell')).toHaveAttribute('data-caption-runtime-state', /^(?:fit|reading)$/)
    const result = await page.locator('.cw-shell').evaluate((shell) => {
      const intersect = (left: DOMRect, right: DOMRect) => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
        Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      const caption = shell.querySelector<HTMLElement>('.cw-captions span')
      const reading = shell.querySelector<HTMLElement>('.cw-speaker .cw-reading-copy')
      const controls = shell.querySelector<HTMLElement>('.cw-controls')!
      const speaker = shell.querySelector<HTMLElement>('#cw-speaker-name')!
      const speakerPanel = shell.querySelector<HTMLElement>('.cw-speaker')!
      const visible = (element: HTMLElement | null) => {
        if (!element) return false
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && getComputedStyle(element).display !== 'none' &&
          getComputedStyle(element).visibility !== 'hidden'
      }
      return {
        state: (shell as HTMLElement).dataset.captionRuntimeState,
        overlayVisible: visible(caption),
        readingVisible: visible(reading),
        captionControls: caption ? intersect(caption.getBoundingClientRect(), controls.getBoundingClientRect()) : 0,
        captionSpeaker: caption ? intersect(caption.getBoundingClientRect(), speaker.getBoundingClientRect()) : 0,
        readingControls: reading ? intersect(speakerPanel.getBoundingClientRect(), controls.getBoundingClientRect()) : 0,
        lineFits: caption ? caption.scrollHeight <= caption.clientHeight + 1 : true,
      }
    })
    expect(result.overlayVisible === result.readingVisible, layout.name).toBe(false)
    if (result.state === 'fit') {
      expect(result.overlayVisible, layout.name).toBe(true)
      expect(result.captionControls, layout.name).toBeLessThanOrEqual(1)
      expect(result.captionSpeaker, layout.name).toBeLessThanOrEqual(1)
      expect(result.lineFits, layout.name).toBe(true)
    } else {
      expect(result.readingVisible, layout.name).toBe(true)
      expect(result.readingControls, layout.name).toBeLessThanOrEqual(1)
    }
  }
})

test('short landscape reading mode preserves usable copy space', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Deterministic geometry is exercised once; cross-engine journeys remain separate.')
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await page.setViewportSize({ width: 568, height: 320 })
  await page.goto('/')
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.locator('.cw-shell').evaluate((shell) => shell.setAttribute('data-media-notice', 'true'))

  const speaker = page.locator('.cw-speaker:not(.cw-speaker--collision-probe)')
  await expect(speaker.locator('.cw-reading-copy')).toBeVisible()
  const box = await speaker.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(120)
  await expect(page.locator('.cw-speaker--collision-probe')).toBeHidden()
})

async function readStoredProgress(page: Page) {
  return page.evaluate(async () => new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readonly')
      const get = transaction.objectStore('progress').get('cw-0001')
      get.onerror = () => reject(get.error)
      get.onsuccess = () => {
        database.close()
        resolve((get.result as Record<string, unknown> | undefined) ?? null)
      }
    }
  }))
}

test('accelerated conclusion returns its verdict before analysis and preserves sealed state on replay', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The real-duration release gate complements this accelerated conclusion.')
  await page.addInitScript((instant) => {
    let current = instant
    Date.now = () => current
    Object.defineProperty(window, '__simjuryAdvanceClock', {
      value: (milliseconds: number) => { current += milliseconds },
      configurable: false,
    })
  }, releaseNow)
  const satisfyInteractionTime = async () => {
    await page.evaluate(() => {
      const clock = window as Window & { __simjuryAdvanceClock: (milliseconds: number) => void }
      clock.__simjuryAdvanceClock(10 * 60 * 1000)
    })
    await page.waitForTimeout(1_100)
  }
  const prohibited: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^wss?:/.test(url.protocol) || /\/(api|workers?|d1|durable-object|ai)(\/|$)/i.test(url.pathname) || url.hostname === 'api.github.com') {
      prohibited.push(request.url())
    }
  })
  // Seed from a same-origin static page so no mounted player can race the
  // fixture with its ordinary debounced progress save.
  await page.goto('/robots.txt')
  await page.evaluate(async (instant) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
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
        completedSessionIds: [
          'cw-0001-monday', 'cw-0001-tuesday', 'cw-0001-wednesday',
          'cw-0001-thursday', 'cw-0001-friday', 'cw-0001-saturday',
        ],
        currentSessionId: 'cw-0001-sunday',
        currentSceneId: 'sun-verdict',
        currentCueId: 'sun-verdict-return',
        notes: 'Private note retained through replay.',
        accessibilityMode: 'reading',
        reasoningContributions: [],
        provisionalVote: 'not-guilty',
        secondVote: 'not-guilty',
        secondBallotWasUnanimous: true,
        majorityDirectionReceived: false,
        sealedVerdict: 'not-guilty',
        sealedAgreement: 'unanimous',
        openCourtVerdictReturned: false,
      }, 'cw-0001')
    }
  }), releaseNow)
  await page.goto('/')
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()

  await expect(page.locator('.cw-reading-copy')).toContainText('The jury returns to the courtroom. Mara Venn stands.')
  await expect(page.locator('.cw-reading-copy')).not.toContainText('The jury returns. The accused stands.')
  await expect(page.locator('.cw-reading-copy')).not.toContainText('Strongest lawful rationale:')
  const continueButton = page.getByLabel('Court playback controls').getByRole('button', { name: 'Continue', exact: true })
  await continueButton.click()
  await continueButton.click()
  await satisfyInteractionTime()
  await page.locator('.cw-interaction button.cw-primary').click()
  await expect(page.locator('.cw-reading-copy')).toContainText('Strongest lawful rationale:')
  await expect(page.locator('.cw-reading-copy')).toContainText('Strongest counter-analysis:')
  await continueButton.click()
  await continueButton.click()
  const analysisDialog = page.locator('.cw-interaction')
  await analysisDialog.locator('select').nth(0).selectOption({ index: 1 })
  await analysisDialog.locator('select').nth(1).selectOption({ index: 1 })
  await analysisDialog.locator('button[aria-pressed="false"]').first().click()
  await satisfyInteractionTime()
  await analysisDialog.locator('button.cw-primary').click()

  await expect(page.getByRole('heading', { name: 'Court Week complete' })).toBeVisible()
  await page.waitForTimeout(200)

  const beforeReplay = await readStoredProgress(page)
  expect(beforeReplay?.completedSessionIds).toHaveLength(7)
  const protectedBefore = {
    completedSessionIds: beforeReplay?.completedSessionIds,
    reasoningContributions: beforeReplay?.reasoningContributions,
    provisionalVote: beforeReplay?.provisionalVote,
    secondVote: beforeReplay?.secondVote,
    finalVote: beforeReplay?.finalVote,
    sealedVerdict: beforeReplay?.sealedVerdict,
    sealedAgreement: beforeReplay?.sealedAgreement,
    openCourtVerdictReturned: beforeReplay?.openCourtVerdictReturned,
    returnedVerdict: beforeReplay?.returnedVerdict,
    returnedAgreement: beforeReplay?.returnedAgreement,
  }

  await page.getByRole('button', { name: /Replay Monday/i }).click()
  await expect(page.getByText('Monday', { exact: false }).first()).toBeVisible()
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  await page.getByLabel('Court playback controls').getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForTimeout(200)

  const afterReplay = await readStoredProgress(page)
  expect({
    completedSessionIds: afterReplay?.completedSessionIds,
    reasoningContributions: afterReplay?.reasoningContributions,
    provisionalVote: afterReplay?.provisionalVote,
    secondVote: afterReplay?.secondVote,
    finalVote: afterReplay?.finalVote,
    sealedVerdict: afterReplay?.sealedVerdict,
    sealedAgreement: afterReplay?.sealedAgreement,
    openCourtVerdictReturned: afterReplay?.openCourtVerdictReturned,
    returnedVerdict: afterReplay?.returnedVerdict,
    returnedAgreement: afterReplay?.returnedAgreement,
  }).toEqual(protectedBefore)
  expect(prohibited).toEqual([])
})
