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
  await expect(page.getByRole('alert')).toContainText('different case revision')
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
  await page.getByLabel('Reading mode').check()
  await expect(page.getByRole('alert')).toContainText('could not save progress')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await expect(page.locator('.cw-shell')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Progress is held in this tab')
})

test('corrupt stored progress is disclosed and not silently overwritten on hydration', async ({ page }) => {
  await page.goto('/robots.txt')
  await page.evaluate(async (contract) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore(contract.store)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store, 'readwrite')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
      transaction.objectStore(contract.store).put({ courtWeekId: 'cw-0001', notes: 'partial' }, 'cw-0001')
    }
  }), PROGRESS_DATABASE)

  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('damaged and could not be recovered')
  await page.waitForTimeout(250)
  const stored = await page.evaluate(async (contract) => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const get = database.transaction(contract.store).objectStore(contract.store).get('cw-0001')
      get.onsuccess = () => { database.close(); resolve(get.result) }
      get.onerror = () => reject(get.error)
    }
  }), PROGRESS_DATABASE)
  expect(stored).toEqual({ courtWeekId: 'cw-0001', notes: 'partial' })
  await openDesk(page)
  await expect(page.getByLabel('Your private notes')).toHaveValue('')
})
