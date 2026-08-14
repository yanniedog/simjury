import { expect, test, type Page } from '@playwright/test'
import { elevenMinutesDeliberation } from '../../src/courtweek/content/deliberation'
import { elevenMinutesSessions } from '../../src/courtweek/content/sessions'

const releaseNow = Date.parse('2026-08-17T09:00:00+10:00')

async function seedProgress(page: Page, position: Record<string, unknown>) {
  await page.goto('/robots.txt')
  await page.evaluate(async ({ instant, position }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('simjury-court-week-v1', 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => request.result.createObjectStore('progress')
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('progress', 'readwrite')
      transaction.onerror = () => reject(transaction.error)
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.objectStore('progress').put({
        schemaVersion: 'court-week-progress-v1', courtWeekId: 'cw-0001', revision: '2026.08.03-r2',
        highestObservedTime: new Date(instant).toISOString(), completedSessionIds: [],
        currentSessionId: 'cw-0001-monday', currentSceneId: 'mon-arrival', currentCueId: 'mon-arrival-1',
        notes: '', reasoningContributions: [], accessibilityMode: 'reading', majorityDirectionReceived: false,
        ...position,
      }, ['cw-0001', '2026.08.03-r2'])
    }
  }), { instant: releaseNow, position })
}

async function openInteraction(page: Page, action: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Take your seat' }).click()
  await page.getByRole('button', { name: action, exact: true }).click()
  return page.locator('.cw-interaction')
}

test('reasoning and a pre-seal ballot retain drafts through the evidence desk across engines', async ({ page }) => {
  await page.addInitScript((instant) => { Date.now = () => instant }, releaseNow)
  await page.setViewportSize({ width: 320, height: 568 })
  const saturday = elevenMinutesSessions[5]
  const reasoningScene = saturday.scenes.find(({ id }) => id === 'sat-improper')!
  const proposition = elevenMinutesDeliberation.propositions.find(
    ({ sceneIds, moves }) => sceneIds.includes(reasoningScene.id) && moves.includes('test-source'),
  )!
  await seedProgress(page, {
    completedSessionIds: elevenMinutesSessions.slice(0, 5).map(({ id }) => id),
    currentSessionId: saturday.id, currentSceneId: reasoningScene.id,
    currentCueId: reasoningScene.cues.at(-1)!.id,
  })
  const reasoning = await openInteraction(page, 'Add a reasoning contribution')
  await reasoning.getByLabel('Legal question').selectOption({ label: proposition.legalQuestion })
  await reasoning.getByRole('combobox').nth(1).selectOption(proposition.evidenceIds[0])
  await reasoning.getByRole('button', { name: 'Test the source' }).click()
  await reasoning.getByLabel(/accused.*silence/i).check()
  await expect(reasoning.getByText('test-source', { exact: true })).toHaveCount(0)

  const reasoningDeskTrigger = reasoning.getByRole('button', { name: /Review juror desk/i })
  await reasoningDeskTrigger.focus()
  await page.keyboard.press('Enter')
  const desk = page.getByRole('dialog', { name: 'Your working papers' })
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1)
  await expect(desk.getByRole('button', { name: 'Close juror desk' })).toBeFocused()
  await expect(desk.getByRole('button', { name: 'Export progress' })).toBeVisible()
  await expect(desk.getByRole('button', { name: 'Import progress' })).toHaveCount(0)
  await expect(desk.locator('input[type="file"]')).toHaveCount(0)
  const admittedEvidence = desk.locator('.cw-desk__evidence-list button').first()
  await admittedEvidence.click()
  await expect(page.locator('.cw-desk')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(admittedEvidence).toBeFocused()
  await page.keyboard.press('Escape')

  const restoredReasoning = page.locator('.cw-interaction')
  await expect(restoredReasoning.getByRole('button', { name: /Review juror desk/i })).toBeFocused()
  await expect(restoredReasoning.getByLabel('Legal question')).toHaveValue(proposition.legalQuestion)
  await expect(restoredReasoning.getByRole('combobox').nth(1)).toHaveValue(proposition.evidenceIds[0])
  await expect(restoredReasoning.getByRole('button', { name: 'Test the source' })).toHaveAttribute('aria-pressed', 'true')
  await expect(restoredReasoning.getByLabel(/accused.*silence/i)).toBeChecked()

  // A 160x284 CSS viewport exercises 320x568 at effective 200% reflow.
  await page.setViewportSize({ width: 160, height: 284 })
  const sunday = elevenMinutesSessions[6]
  const ballotScene = sunday.scenes.find(({ id }) => id === 'sun-second-ballot')!
  await seedProgress(page, {
    completedSessionIds: elevenMinutesSessions.slice(0, 6).map(({ id }) => id),
    currentSessionId: sunday.id, currentSceneId: ballotScene.id, currentCueId: ballotScene.cues.at(-1)!.id,
    provisionalVote: 'not-guilty',
  })
  const ballot = await openInteraction(page, 'Open the second private ballot')
  const draftVote = ballot.getByRole('button', { name: 'Guilty of murder' })
  await draftVote.click()
  const ballotDeskTrigger = ballot.getByRole('button', { name: /Review juror desk/i })
  await ballotDeskTrigger.scrollIntoViewIfNeeded()
  await ballotDeskTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Close juror desk' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.cw-interaction').getByRole('button', { name: /Review juror desk/i })).toBeFocused()
  await expect(page.locator('.cw-interaction').getByRole('button', { name: 'Guilty of murder' })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})
