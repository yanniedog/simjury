import { expect, test, type Page } from '@playwright/test'

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
        revision: '2026.08.03-r1',
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
        returnedVerdict: 'not-guilty',
        returnedAgreement: 'unanimous',
      }, 'cw-0001')
    }
  }), releaseNow)
  await page.goto('/')
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()

  await expect(page.locator('.cw-reading-copy')).toContainText('The jury returns. The accused stands.')
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
    returnedVerdict: afterReplay?.returnedVerdict,
    returnedAgreement: afterReplay?.returnedAgreement,
  }).toEqual(protectedBefore)
  expect(prohibited).toEqual([])
})
