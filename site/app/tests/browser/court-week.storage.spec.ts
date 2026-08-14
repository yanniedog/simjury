import { expect, test, type Download, type Page } from '@playwright/test'
import { PROGRESS_DATABASE } from '../../src/courtweek/state/progress'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function openDesk(page: Page) {
  await page.getByText('Experience settings', { exact: true }).click()
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Storage failure journeys run once; storage primitives have unit coverage.')
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
})

test('blocked storage stays playable and exports private notes only by explicit opt-in', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
  })
  await page.goto('/')
  expect(await page.evaluate(() => typeof indexedDB)).toBe('undefined')
  await expect(page.getByRole('alert')).toContainText('Device storage is unavailable')
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel('Reading mode').check()
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.getByRole('status')).toContainText('Progress is held in this tab')
  await page.getByRole('button', { name: 'Juror desk', exact: true }).click()
  await page.getByLabel('Your private notes').fill('Private causation note.')

  const defaultDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export progress' }).click()
  expect(JSON.parse(await downloadText(await defaultDownload)).progress.notes).toBe('')

  await page.getByLabel('Include my private notes in the export').check()
  const privateDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export progress' }).click()
  expect(JSON.parse(await downloadText(await privateDownload)).progress.notes).toBe('Private causation note.')

  const damaged = {
    format: 'simjury-court-week-progress-v1',
    exportedAt: new Date(releaseNow).toISOString(),
    progress: {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: '2026.08.03-r999',
      highestObservedTime: new Date(releaseNow).toISOString(),
      completedSessionIds: [],
      notes: '',
    },
  }
  await page.locator('input[type="file"]').setInputFiles({
    name: 'wrong-revision.simjury-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(damaged)),
  })
  const importAlert = page.locator('.cw-sheet__footer').getByRole('alert')
  await expect(importAlert).toContainText('different case revision')
  await expect(importAlert).toBeInViewport()
  await expect(page.getByLabel('Your private notes')).toHaveValue('Private causation note.')
})

test('quota failure is disclosed after a real gameplay write and play continues', async ({ page }) => {
  await page.addInitScript((storeName) => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === storeName) throw new DOMException('Storage is full.', 'QuotaExceededError')
      return originalPut.apply(this, args)
    }
  }, PROGRESS_DATABASE.store)
  await page.goto('/')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.locator('.cw-entry__settings > summary').click()
  await page.getByLabel('Reading mode').check()
  await expect(page.getByRole('alert')).toContainText('could not save progress')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Progress is held in this tab')
})

test('a prior revision is archived while the revised trial starts without its ballot', async ({ page }) => {
  const archived = {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: 'cw-0001',
    revision: '2026.08.03-r1',
    highestObservedTime: '2026-08-16T18:00:00+10:00',
    completedSessionIds: [
      'cw-0001-monday', 'cw-0001-tuesday', 'cw-0001-wednesday', 'cw-0001-thursday',
      'cw-0001-friday', 'cw-0001-saturday', 'cw-0001-sunday',
    ],
    notes: 'Prior private causation note.',
    provisionalVote: 'unable-to-agree',
    secondVote: 'unable-to-agree',
    finalVote: 'unable-to-agree',
    secondBallotWasUnanimous: false,
    majorityDirectionReceived: true,
    sealedVerdict: 'unable-to-agree',
    sealedAgreement: 'hung',
    openCourtVerdictReturned: true,
    returnedVerdict: 'unable-to-agree',
    returnedAgreement: 'hung',
    reasoningContributions: [],
  }
  await page.goto('/robots.txt')
  await page.evaluate(async ({ contract, archivedProgress }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore(contract.store)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store, 'readwrite')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(contract.store).put(archivedProgress, archivedProgress.courtWeekId)
    }
  }), { contract: PROGRESS_DATABASE, archivedProgress: archived })

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('revised trial has started cleanly')
  await page.getByText('Previous trial records', { exact: true }).click()
  await expect(page.getByText('Case revision 2026.08.03-r1')).toBeVisible()

  const safeDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: `Export revision ${archived.revision}` }).click()
  const safeExport = JSON.parse(await downloadText(await safeDownload))
  expect(safeExport.progress).toMatchObject({ revision: archived.revision, provisionalVote: 'unable-to-agree', notes: '' })

  await page.getByLabel('Include private notes in archive exports').check()
  const privateDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: `Export revision ${archived.revision}` }).click()
  expect(JSON.parse(await downloadText(await privateDownload)).progress.notes).toBe(archived.notes)

  await page.getByText('Experience settings', { exact: true }).click()
  await page.getByLabel('Reading mode').check()
  await expect.poll(() => page.evaluate(async (contract) => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store)
      const store = transaction.objectStore(contract.store)
      const requests = [store.get('cw-0001'), store.get(['cw-0001', '2026.08.03-r1']), store.get(['cw-0001', '2026.08.03-r2'])]
      transaction.oncomplete = () => { database.close(); resolve(requests.map(({ result }) => result)) }
      transaction.onerror = () => reject(transaction.error)
    }
  }), PROGRESS_DATABASE)).toEqual([
    archived,
    archived,
    expect.objectContaining({
      revision: '2026.08.03-r2', completedSessionIds: [], notes: '', accessibilityMode: 'reading',
    }),
  ])
  const revised = await page.evaluate(async (contract) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const get = database.transaction(contract.store).objectStore(contract.store).get(['cw-0001', '2026.08.03-r2'])
      get.onsuccess = () => { database.close(); resolve(get.result) }
      get.onerror = () => reject(get.error)
    }
  }), PROGRESS_DATABASE)
  expect(revised).not.toHaveProperty('provisionalVote')
  expect(revised).not.toHaveProperty('sealedVerdict')
})

test('a newer same-revision legacy record prevents rollback to its composite copy', async ({ page }) => {
  const older = {
    schemaVersion: 'court-week-progress-v1', courtWeekId: 'cw-0001', revision: '2026.08.03-r2',
    highestObservedTime: '2026-08-16T08:00:00+10:00', completedSessionIds: [],
    currentSessionId: 'cw-0001-monday', currentSceneId: 'mon-arrival', currentCueId: 'mon-arrival-1',
    notes: 'Older composite note.',
  }
  const newer = { ...older, highestObservedTime: '2026-08-16T09:00:00+10:00', notes: 'Newer legacy note.' }
  await page.goto('/robots.txt')
  await page.evaluate(async ({ contract, olderRecord, newerRecord }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore(contract.store)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store, 'readwrite')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
      const store = transaction.objectStore(contract.store)
      store.put(olderRecord, ['cw-0001', '2026.08.03-r2'])
      store.put(newerRecord, 'cw-0001')
    }
  }), { contract: PROGRESS_DATABASE, olderRecord: older, newerRecord: newer })

  await page.goto('/')
  await openDesk(page)
  await expect(page.getByLabel('Your private notes')).toHaveValue(newer.notes)
})

test('corrupt current progress is disclosed while its valid archive remains exportable', async ({ page }) => {
  const archived = {
    schemaVersion: 'court-week-progress-v1', courtWeekId: 'cw-0001', revision: '2026.08.03-r1',
    highestObservedTime: '2026-08-15T09:00:00+10:00', completedSessionIds: [], notes: 'Recoverable archive.',
  }
  await page.goto('/robots.txt')
  await page.evaluate(async ({ contract, archivedProgress }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore(contract.store)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store, 'readwrite')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(contract.store).put(
        { courtWeekId: 'cw-0001', notes: 'partial' },
        ['cw-0001', '2026.08.03-r2'],
      )
      transaction.objectStore(contract.store).put(archivedProgress, ['cw-0001', archivedProgress.revision])
    }
  }), { contract: PROGRESS_DATABASE, archivedProgress: archived })

  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('damaged and could not be recovered')
  await page.getByText('Previous trial records', { exact: true }).click()
  await expect(page.getByRole('button', { name: `Export revision ${archived.revision}` })).toBeVisible()
  await page.waitForTimeout(250)
  const stored = await page.evaluate(async (contract) => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const get = database.transaction(contract.store).objectStore(contract.store)
        .get(['cw-0001', '2026.08.03-r2'])
      get.onsuccess = () => { database.close(); resolve(get.result) }
      get.onerror = () => reject(get.error)
    }
  }), PROGRESS_DATABASE)
  expect(stored).toEqual({ courtWeekId: 'cw-0001', notes: 'partial' })
  await openDesk(page)
  await expect(page.getByLabel('Your private notes')).toHaveValue('')
})
