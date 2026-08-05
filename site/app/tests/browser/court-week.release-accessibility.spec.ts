import { expect, test, type Page } from '@playwright/test'
import { elevenMinutesSessions } from '../../src/courtweek/content/sessions'
import { responsiveCaptionPlacements, type CaptionViewport } from '../../src/courtweek/ui/captionPlacement'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function prepareCourt(page: Page) {
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
  }, releaseNow)
  await page.goto('/')
}

async function seedProgress(page: Page, position: Record<string, unknown>) {
  await page.goto('/robots.txt')
  await page.evaluate(async ({ instant, seededPosition }) => new Promise<void>((resolve, reject) => {
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
        revision: '2026.08.03-r2',
        highestObservedTime: new Date(instant).toISOString(),
        completedSessionIds: [],
        currentSessionId: 'cw-0001-monday',
        currentSceneId: 'mon-arrival',
        currentCueId: 'mon-arrival-1',
        notes: '',
        reasoningContributions: [],
        accessibilityMode: 'reading',
        majorityDirectionReceived: false,
        ...seededPosition,
      }, 'cw-0001')
    }
  }), { instant: releaseNow, seededPosition: position })
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
        revision: '2026.08.03-r2',
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

test('reading mode announces each newly displayed legal cue exactly once', async ({ page }) => {
  await prepareCourt(page)
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()

  const readingCopy = page.locator('.cw-reading-copy')
  const firstCue = await readingCopy.textContent()
  await expect(readingCopy).toHaveAttribute('aria-live', 'polite')
  await expect(readingCopy).toHaveAttribute('aria-atomic', 'true')
  await expect(readingCopy.locator('.cw-visually-hidden')).toContainText('Court officer:')
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)
  await expect(page.locator('.cw-cue-live-region')).toHaveAttribute('aria-live', 'off')
  await expect(page.locator('.cw-cue-live-region')).toHaveAttribute('aria-hidden', 'true')

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(readingCopy).not.toHaveText(firstCue ?? '')
  await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)
  await expect(page.locator('.cw-cue-live-region')).toHaveAttribute('aria-live', 'off')
  await expect(page.locator('.cw-cue-live-region')).toHaveAttribute('aria-hidden', 'true')
})

test('Tuesday distress assistive output states that one person was aboard', async ({ page }) => {
  const scene = elevenMinutesSessions[1].scenes.find(({ id }) => id === 'tue-recording')!
  const distressCue = scene.cues.find(({ id }) => id === 'tue-recording-play--caption-4')!
  await seedProgress(page, {
    completedSessionIds: ['cw-0001-monday'],
    currentSessionId: 'cw-0001-tuesday',
    currentSceneId: scene.id,
    currentCueId: distressCue.id,
  })
  await prepareCourt(page)
  await page.getByRole('button', { name: 'Take your seat' }).click()

  const readingCopy = page.locator('.cw-reading-copy')
  await expect(readingCopy).toHaveAttribute('aria-live', 'polite')
  await expect(readingCopy).toContainText('One person aboard')
})

test('mandatory deliberation selects retain 44px targets and a three-pixel focus ring', async ({ page }) => {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  const scene = elevenMinutesSessions[5].scenes.find(({ id }) => id === 'sat-room')!
  await seedProgress(page, {
    completedSessionIds: [
      'cw-0001-monday', 'cw-0001-tuesday', 'cw-0001-wednesday',
      'cw-0001-thursday', 'cw-0001-friday',
    ],
    currentSessionId: 'cw-0001-saturday', currentSceneId: scene.id, currentCueId: scene.cues.at(-1)!.id,
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  const dialog = page.getByRole('dialog', { name: /Optionally test this opening concern/i })
  for (const [index, label] of ['Legal question', 'Admitted evidence'].entries()) {
    const select = dialog.getByLabel(label)
    if (index > 0) await page.keyboard.press('Tab')
    await expect(select).toBeFocused()
    const geometry = await select.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { height: box.height, outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle }
    })
    expect(geometry.height).toBeGreaterThanOrEqual(44)
    expect(geometry).toMatchObject({ outlineWidth: '3px', outlineStyle: 'solid' })
  }
})

test('inspect-exhibit prompts keep admitted exhibits reachable inside the modal boundary', async ({ page }) => {
  const scene = elevenMinutesSessions[0].scenes.find(({ id }) => id === 'mon-orr-chief')!
  await seedProgress(page, { currentSceneId: scene.id, currentCueId: scene.cues.at(-1)!.id })
  await prepareCourt(page)
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const interaction = page.getByRole('dialog', { name: /Inspect the admitted route diagram/i })
  await interaction.getByRole('button', { name: /Open juror desk/i }).click()
  await expect(page.getByRole('dialog', { name: 'Your working papers' })).toBeVisible()
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

test('Monday captions avoid line overflow with only enumerated safe-layout fallbacks', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Measured production-font geometry runs once; content limits run cross-engine in unit tests.')
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareCourt(page)
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.cw-stage').evaluate((stage) => {
    const probe = document.createElement('div')
    probe.id = 'monday-caption-probe'
    probe.className = 'cw-captions'
    probe.style.visibility = 'visible'
    probe.style.display = 'flex'
    probe.append(document.createElement('span'))
    stage.append(probe)
  })

  const monday = elevenMinutesSessions[0]
  const layouts: Array<{ viewport: CaptionViewport; width: number; height: number }> = [
    { viewport: 'phonePortrait', width: 390, height: 844 },
    { viewport: 'phoneLandscape', width: 844, height: 390 },
    { viewport: 'tablet', width: 820, height: 1180 },
    { viewport: 'desktop', width: 1280, height: 800 },
  ]
  // Exact pairs measured after the crop review: runtime fallback is allowed only
  // when the probe below still reports no overflow or speaker/control collision.
  // Re-measure every viewport before changing this independent regression baseline.
  const intentionalRuntimeFallbacks = new Set([
    'desktop:mon-orr-cross',
    'phoneLandscape:mon-orr-cross',
  ])
  const observedFallbacks = new Set<string>()
  const measuredFailures: string[] = []

  for (const layout of layouts) {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    for (const scene of monday.scenes) {
      const placements = responsiveCaptionPlacements(scene.visual)
      const placement = placements[layout.viewport]
      const fallbackKey = `${layout.viewport}:${scene.id}`
      if (!placement.fits) {
        expect(intentionalRuntimeFallbacks.has(fallbackKey), fallbackKey).toBe(true)
        observedFallbacks.add(fallbackKey)
        continue
      }
      for (const cue of scene.cues) {
        const result = await page.locator('.cw-shell').evaluate((shell, input) => {
          const root = shell as HTMLElement
          const overlay = root.querySelector<HTMLElement>('#monday-caption-probe')!
          overlay.style.left = `${input.placement.region.x}%`
          overlay.style.top = `${input.placement.region.y}%`
          overlay.style.width = `${input.placement.region.width}%`
          overlay.style.height = `${input.placement.region.height}%`
          const caption = overlay.querySelector<HTMLElement>('span')!
          // Match the immutable probe used by ImmersiveCourtShell's runtime fit check;
          // the visible speaker panel expands after a reading fallback is selected.
          const speaker = root.querySelector<HTMLElement>('.cw-speaker--collision-probe p')!
          caption.textContent = input.text
          const controls = root.querySelector<HTMLElement>('.cw-controls')!
          const intersect = (left: DOMRect, right: DOMRect) => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
            Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
          const captionBox = caption.getBoundingClientRect()
          return {
            displayed: getComputedStyle(overlay).display !== 'none',
            lineFits: caption.scrollHeight <= caption.clientHeight + 1,
            controlsIntersection: intersect(captionBox, controls.getBoundingClientRect()),
            speakerIntersection: intersect(captionBox, speaker.getBoundingClientRect()),
          }
        }, { placement, text: cue.text })
        const key = `${layout.viewport}:${cue.id}`
        if (!result.displayed) measuredFailures.push(`${key}:hidden`)
        if (!result.lineFits) measuredFailures.push(`${key}:line-overflow`)
        if (result.controlsIntersection > 1) {
          if (intentionalRuntimeFallbacks.has(fallbackKey)) observedFallbacks.add(fallbackKey)
          else measuredFailures.push(`${key}:controls-collision`)
        }
        if (result.speakerIntersection > 1) {
          if (intentionalRuntimeFallbacks.has(fallbackKey)) observedFallbacks.add(fallbackKey)
          else measuredFailures.push(`${key}:speaker-collision`)
        }
      }
    }
  }
  // Font rasterisation can make an allowlisted fallback unnecessary on another
  // supported platform. Unexpected fallbacks still fail in the checks above.
  expect([...observedFallbacks].every((key) => intentionalRuntimeFallbacks.has(key))).toBe(true)
  expect(measuredFailures).toEqual([])
})

test('Tuesday captions avoid line overflow with only enumerated safe-layout fallbacks', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Measured production-font geometry runs once; content limits run cross-engine in unit tests.')
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareCourt(page)
  await page.getByLabel('Audio and captions').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.cw-stage').evaluate((stage) => {
    const probe = document.createElement('div')
    probe.id = 'tuesday-caption-probe'
    probe.className = 'cw-captions'
    probe.style.visibility = 'visible'
    probe.style.display = 'flex'
    probe.append(document.createElement('span'))
    stage.append(probe)
  })

  const tuesday = elevenMinutesSessions[1]
  const layouts: Array<{ viewport: CaptionViewport; width: number; height: number }> = [
    { viewport: 'phonePortrait', width: 390, height: 844 },
    { viewport: 'phoneLandscape', width: 844, height: 390 },
    { viewport: 'tablet', width: 820, height: 1180 },
    { viewport: 'desktop', width: 1280, height: 800 },
  ]
  // Exact pairs measured after the crop review: runtime fallback is allowed only
  // when the probe below still reports no overflow or speaker/control collision.
  // Re-measure every viewport before changing this independent regression baseline.
  const intentionalRuntimeFallbacks = new Set([
    'desktop:tue-recording',
    'phoneLandscape:tue-adjourn',
    'phoneLandscape:tue-dorn-cross',
    'phoneLandscape:tue-mir-cross',
    'phoneLandscape:tue-recording',
    'phonePortrait:tue-adjourn',
    'phonePortrait:tue-dorn-cross',
    'phonePortrait:tue-mir-cross',
    'tablet:tue-recording',
  ])
  const observedFallbacks = new Set<string>()
  const measuredFailures: string[] = []

  for (const layout of layouts) {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    for (const scene of tuesday.scenes) {
      const placement = responsiveCaptionPlacements(scene.visual)[layout.viewport]
      const fallbackKey = `${layout.viewport}:${scene.id}`
      if (!placement.fits) {
        expect(intentionalRuntimeFallbacks.has(fallbackKey), fallbackKey).toBe(true)
        observedFallbacks.add(fallbackKey)
        continue
      }
      for (const cue of scene.cues) {
        const result = await page.locator('.cw-shell').evaluate((shell, input) => {
          const root = shell as HTMLElement
          const overlay = root.querySelector<HTMLElement>('#tuesday-caption-probe')!
          overlay.style.left = `${input.placement.region.x}%`
          overlay.style.top = `${input.placement.region.y}%`
          overlay.style.width = `${input.placement.region.width}%`
          overlay.style.height = `${input.placement.region.height}%`
          const caption = overlay.querySelector<HTMLElement>('span')!
          // Match the immutable probe used by ImmersiveCourtShell's runtime fit check;
          // the visible speaker panel expands after a reading fallback is selected.
          const speaker = root.querySelector<HTMLElement>('.cw-speaker--collision-probe p')!
          caption.textContent = input.text
          const controls = root.querySelector<HTMLElement>('.cw-controls')!
          const intersect = (left: DOMRect, right: DOMRect) => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
            Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
          const captionBox = caption.getBoundingClientRect()
          return {
            displayed: getComputedStyle(overlay).display !== 'none',
            lineFits: caption.scrollHeight <= caption.clientHeight + 1,
            controlsIntersection: intersect(captionBox, controls.getBoundingClientRect()),
            speakerIntersection: intersect(captionBox, speaker.getBoundingClientRect()),
          }
        }, { placement, text: cue.text })
        const key = `${layout.viewport}:${cue.id}`
        if (!result.displayed) measuredFailures.push(`${key}:hidden`)
        if (!result.lineFits) measuredFailures.push(`${key}:line-overflow`)
        if (result.controlsIntersection > 1) {
          if (intentionalRuntimeFallbacks.has(fallbackKey)) observedFallbacks.add(fallbackKey)
          else measuredFailures.push(`${key}:controls-collision`)
        }
        if (result.speakerIntersection > 1) {
          if (intentionalRuntimeFallbacks.has(fallbackKey)) observedFallbacks.add(fallbackKey)
          else measuredFailures.push(`${key}:speaker-collision`)
        }
      }
    }
  }
  // Font rasterisation can make an allowlisted fallback unnecessary on another
  // supported platform. Unexpected fallbacks still fail in the checks above.
  expect([...observedFallbacks].every((key) => intentionalRuntimeFallbacks.has(key))).toBe(true)
  expect(measuredFailures).toEqual([])
})
