import type { Page } from '@playwright/test'
import { PROGRESS_DATABASE, PROGRESS_PACK_STORE } from '../../src/courtweek/state/progress'

const seedDocument = '**/__court-week-progress-seed'

/** Opens a same-origin document without mounting the player or its progress writer. */
export async function openProgressSeedDocument(page: Page): Promise<void> {
  await page.route(seedDocument, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Court Week progress fixture</title>',
  }))
  await page.goto('/__court-week-progress-seed')
  await page.unroute(seedDocument)
}

/** Places the browser after the route diagram's completed admission without replaying testimony. */
export async function seedRouteAvailable(page: Page, instant: number): Promise<void> {
  await openProgressSeedDocument(page)
  await page.evaluate(async ({ highestObservedTime, contract, packStore }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(contract.name, contract.version)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(contract.store)) request.result.createObjectStore(contract.store)
      if (!request.result.objectStoreNames.contains(packStore)) request.result.createObjectStore(packStore)
    }
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(contract.store, 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.objectStore(contract.store).put({
        schemaVersion: 'court-week-progress-v1',
        courtWeekId: 'cw-0001',
        revision: '2026.08.03-r2',
        highestObservedTime: new Date(highestObservedTime).toISOString(),
        completedSessionIds: [],
        currentSessionId: 'cw-0001-monday',
        currentSceneId: 'mon-elements',
        currentCueId: 'mon-elements-1',
        notes: '',
        reasoningContributions: [],
        majorityDirectionReceived: false,
      }, ['cw-0001', '2026.08.03-r2'])
    }
  }), { highestObservedTime: instant, contract: PROGRESS_DATABASE, packStore: PROGRESS_PACK_STORE })
}
