import type { Page } from '@playwright/test'

/** Places the browser after the route diagram's completed admission without replaying testimony. */
export async function seedRouteAvailable(page: Page, instant: number): Promise<void> {
  await page.goto('/robots.txt')
  await page.evaluate(async (highestObservedTime) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('progress')) request.result.createObjectStore('progress')
    }
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.objectStore('progress').put({
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
  }), instant)
}
