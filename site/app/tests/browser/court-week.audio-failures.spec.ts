import { expect, test, type Page } from '@playwright/test'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

type AudioProbe = {
  online: boolean
  playCalls: number
  speechCalls: number
  cancelCalls: number
}

async function installFailedMedia(page: Page, voicesWhenOnline: boolean) {
  await page.addInitScript(({ instant, enableVoices }) => {
    Date.now = () => instant
    const probe: AudioProbe = {
      online: true,
      playCalls: 0,
      speechCalls: 0,
      cancelCalls: 0,
    }
    Object.defineProperty(window, '__simjuryAudioProbe', { value: probe })
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => probe.online })

    class FailedAudio extends EventTarget {
      src = ''
      currentTime = 0
      preload = ''
      ended = false
      canPlayType() { return 'probably' }
      load() { /* the hook owns the single retry */ }
      play() {
        probe.playCalls += 1
        return Promise.reject(new Error('Deterministic media timeout.'))
      }
      pause() { this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: FailedAudio })

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
        getVoices: () => enableVoices ? [{ lang: 'en-AU', name: 'Test voice' }] : [],
        speak: () => { probe.speechCalls += 1 },
        cancel: () => { probe.cancelCalls += 1 },
        pause() {}, resume() {},
      },
    })
  }, { instant: releaseNow, enableVoices: voicesWhenOnline })
}

async function probe(page: Page): Promise<AudioProbe> {
  return page.evaluate(() => (
    window as typeof window & { __simjuryAudioProbe: AudioProbe }
  ).__simjuryAudioProbe)
}

test('failed recorded media reaches device speech through the mounted player', async ({ page }) => {
  await installFailedMedia(page, true)
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()

  await expect.poll(async () => (await probe(page)).speechCalls).toBe(1)
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  expect([0, 2]).toContain((await probe(page)).playCalls)
})

test('zero available voices enters automatic reading mode', async ({ page }) => {
  await installFailedMedia(page, false)
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()

  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  await expect(page.getByText('Audio is unavailable. Reading mode is ready.')).toBeVisible()
  const presentation = page.getByLabel('Presentation mode')
  const callsAfterFallback = await probe(page)
  await expect(presentation).toHaveValue('audio-first')
  await presentation.selectOption('captions')
  await expect(presentation).toHaveValue('captions')
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  await presentation.selectOption('audio-first')
  await expect(presentation).toHaveValue('audio-first')
  await expect(page.locator('.cw-reading-copy')).toBeVisible()
  expect(await probe(page)).toMatchObject({
    playCalls: callsAfterFallback.playCalls,
    speechCalls: 0,
  })
})

test('temporary offline fallback resumes at the same cue without duplicate speech', async ({ page }) => {
  await installFailedMedia(page, true)
  await page.goto('/')
  await page.evaluate(() => {
    const state = (window as typeof window & { __simjuryAudioProbe: AudioProbe }).__simjuryAudioProbe
    state.online = false
    window.dispatchEvent(new Event('offline'))
  })
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect.poll(async () => (await probe(page)).speechCalls).toBe(1)

  const speaker = await page.locator('#cw-speaker-name').textContent()
  await page.evaluate(() => {
    const state = (window as typeof window & { __simjuryAudioProbe: AudioProbe }).__simjuryAudioProbe
    state.online = true
    window.dispatchEvent(new Event('online'))
  })
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.waitForTimeout(100)
  expect((await probe(page)).speechCalls).toBe(1)
  await page.getByRole('button', { name: 'Resume' }).click()

  await expect.poll(async () => (await probe(page)).speechCalls).toBe(2)
  await expect(page.locator('#cw-speaker-name')).toHaveText(speaker ?? '')
  await page.waitForTimeout(100)
  expect((await probe(page)).speechCalls).toBe(2)
})
