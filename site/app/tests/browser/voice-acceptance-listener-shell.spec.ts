import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import type { VoiceAcceptanceBundle } from '../../scripts/court-week-voice-acceptance-bundle'
import { validateCompletedListenerSubmission, type ListenerSubmission } from
  '../../scripts/court-week-voice-acceptance-export'
import { createPrivateListenerReviewShell } from '../../scripts/court-week-voice-acceptance-listener-shell'
import { voiceReviewDigest } from '../../scripts/court-week-voice-distinctness'

const hash = (value: Uint8Array | string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const roots: string[] = []; let launchFile = ''; let browserListener: VoiceAcceptanceBundle
let browserTemplate: ListenerSubmission
const directory = (name: string) => { const value = mkdtempSync(join(tmpdir(), `simjury-${name}-`)); roots.push(value); return value }
// https://github.com/WebKit/WebKit/blob/2cfd74cacfc8104b3189fca9832451375b893d80/LayoutTests/webaudio/resources/media/half-a-second-48000.mp3
// Upstream bytes SHA-256: 7aef1dc891cbec08ec8f142bc010b93c8ef0a806724b05551c7833e3a21bf7d5.
const validMp3 = Buffer.from('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', 'base64')
const audioFixture = (sample: number) => { if (sample === 1) return Buffer.from(validMp3)
  const tag = Buffer.alloc(128); tag.write('TAG'); tag.write(`Opaque ${sample}`, 3); return Buffer.concat([validMp3, tag]) }

test.beforeAll(() => {
  const source = directory('listener-browser-source'); const output = directory('listener-browser-output'); let ordinal = 0
  const clip = (clipId: string) => { const bytes = audioFixture(++ordinal); writeFileSync(join(source, `${clipId}.mp3`), bytes)
    return { clipId, audioSha256: hash(bytes), integratedLufs: -18,
      exactSourceEvidenceSha256: hash(`source-${clipId}`), loudnessAnalysisEvidenceSha256: hash(`loudness-${clipId}`) } }
  const comparisons = Array.from({ length: 28 }, (_, index) => { const id = String(index + 1).padStart(2, '0')
    return { roleId: `role-${id}`, listenerLabel: `Final voice ${index + 1}`, pairId: `ab-${id}`,
      canonicalTextDigest: hash(`text-${id}`), clips: [clip(`ab-${id}-a`), clip(`ab-${id}-b`)] } })
  const recognitionTrials = Array.from({ length: 26 }, (_, index) => { const id = String(index + 1).padStart(2, '0')
    const sample = clip(`recognition-${id}-sample`); return { trialId: `recognition-${id}`, sampleClipId: sample.clipId,
      sampleAudioSha256: sample.audioSha256, canonicalTextDigest: hash('neutral'),
      exactSourceEvidenceSha256: hash(`recognition-${id}`), options: Array.from({ length: 4 }, (_entry, option) => (
        { choiceId: `recognition-${id}-choice-${option + 1}`, listenerLabel: `Voice ${option + 1}` })) } })
  const payload = { schema: 'simjury.court-week-voice-acceptance-bundle/v1', blinded: true,
    sourceDigests: Object.fromEntries(['candidateContentDigest', 'mediaManifestDigest', 'nameReviewDigest',
      'performanceDigest', 'pronunciationDigest'].map((key) => [key, hash(key)])),
    distinctnessApprovalDigest: hash('distinctness'), castingContractDigest: hash('casting'),
    assignmentDigest: hash('assignment'), comparisons, recognitionTrials,
    distinctnessComparisons: [{ pairId: 'distinctness-001', clipIds: ['ab-01-a', 'ab-02-a'] }] }
  const listener = { ...payload, bundleDigest: voiceReviewDigest(payload) } as VoiceAcceptanceBundle
  const decision = { listenerId: 'listener-01', blindingConfirmed: null, nativeAustralianEnglishSelfAttested: null,
    devices: [], clipRatings: comparisons.flatMap(({ roleId, clips }) => clips.map(({ clipId }) => ({ roleId, clipId,
      naturalness: null, australianAuthenticity: null, accentAssessment: null }))),
    preferences: comparisons.map(({ pairId }) => ({ pairId, preferredClipId: null })),
    recognitionAnswers: recognitionTrials.map(({ trialId }) => ({ trialId, selectedChoiceId: null })),
    distinctnessDecisions: [{ pairId: 'distinctness-001', distinguishable: null }],
    defectReviewComplete: false, defects: [], reviewReference: '' }
  browserListener = listener; browserTemplate = { schema: 'simjury.court-week-voice-acceptance-listener-submission/v1',
    bundleDigest: listener.bundleDigest, listener: decision }
  writeFileSync(join(source, 'listener.json'), JSON.stringify(listener)); writeFileSync(join(source,
    'submission-listener-01.json'), JSON.stringify(browserTemplate))
  launchFile = createPrivateListenerReviewShell(source, output, 'submission-listener-01.json', listener.bundleDigest).launchFile
})
test.afterAll(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))
test.setTimeout(45_000)

test('private listener form is complete, usable and offline from file', async ({ page }) => {
  const outbound: string[] = []; const pageErrors: string[] = []
  page.on('request', (request) => { if (/^https?:/u.test(request.url())) outbound.push(request.url()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://example.invalid/**', (route) => route.abort())
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto(pathToFileURL(launchFile).href, { waitUntil: 'domcontentloaded', timeout: 10_000 })
  expect(pageErrors).toEqual([])
  await expect(page.locator('#status')).toHaveText(/Package ready/u); await expect(page.locator('#clips')).toHaveText('82')
  await expect(page.getByRole('form', { name: 'Your private review' })).toBeVisible()
  await expect(page.locator('fieldset')).toHaveCount(56 + 28 + 26 + 1 + 3)
  await expect(page.locator('select[name^="naturalness-"]')).toHaveCount(56)
  await expect(page.locator('select[name^="authenticity-"]')).toHaveCount(56)
  await expect(page.locator('audio')).toHaveCount(140)
  const targetSizes = await page.evaluate(() => ['nav a', '.choices label', 'select', 'input[type=text]', 'summary',
    'audio', 'button'].map((selector) => { const box = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
    return { selector, width: Math.round(box.width), height: Math.round(box.height) } }))
  for (const target of targetSizes) { expect(target.width, `${target.selector} width`).toBeGreaterThanOrEqual(44)
    expect(target.height, `${target.selector} height`).toBeGreaterThanOrEqual(44) }
  const skip = page.getByRole('link', { name: 'Skip to review form' }); await skip.focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#review-form$/u)
  const naturalness = page.locator('select[name^="naturalness-"]').first(); await naturalness.focus(); await page.keyboard.press('Tab')
  await expect(page.locator('select[name^="authenticity-"]').first()).toBeFocused()
  for (const prefix of ['preference-', 'recognition-', 'distinctness-']) {
    const controls = page.locator(`input[type=radio][name^="${prefix}"]`); await controls.first().focus()
    await page.keyboard.press('ArrowRight'); await expect(controls.nth(1)).toBeFocused(); await expect(controls.nth(1)).toBeChecked()
  }
  await expect(page.locator('audio').first()).toHaveAttribute('src', /^ab-[0-9]{2}-[ab]\.mp3$/u)
  expect(await page.evaluate(async () => Promise.race([fetch('https://example.invalid/csp-probe').then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))]))).toBe(false)
  expect(outbound).toEqual([])
  // A 160x284 CSS viewport applies the reflow pressure of 320x568 at effective 200% browser zoom.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.setViewportSize({ width: 160, height: 284 })
  // Collapsed <details> subtrees report unconstrained intrinsic geometry in Firefox while reaching the
  // reader in none of them, so the defect controls are measured open, in the state a listener sees.
  await page.evaluate(() => document.querySelectorAll('details').forEach((node) => { node.open = true }))
  const reflow = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8).map((node) => ({ tag: node.tagName, className: node.className,
        width: Math.round(node.getBoundingClientRect().width), text: node.textContent?.trim().slice(0, 40) })),
    wideScrollers: [...document.querySelectorAll<HTMLElement>('body *')].filter((node) => node.scrollWidth > node.clientWidth + 1)
      .slice(0, 8).map((node) => ({ tag: node.tagName, client: node.clientWidth, scroll: node.scrollWidth })) }))
  expect(reflow).toEqual({ clientWidth: 160, scrollWidth: 160, offenders: [], wideScrollers: [] })
  await page.evaluate(() => document.querySelectorAll('details').forEach((node) => { node.open = false }))

  await page.evaluate(() => {
    const review = document.querySelector<HTMLFormElement>('#review-form')!
    for (const select of review.querySelectorAll('select')) if (!select.name.startsWith('defect-kind-')) {
      select.value = select.name.startsWith('accent-') ? 'australian' : '4'
    }
    for (const name of new Set([...review.querySelectorAll<HTMLInputElement>('input[type=radio]')].map(({ name }) => name))) {
      review.querySelector<HTMLInputElement>(`input[type=radio][name="${name}"]`)!.checked = true
    }
    for (const name of ['blindingConfirmed', 'defectReviewComplete']) {
      review.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.checked = true
    }
    review.querySelector<HTMLInputElement>('input[name=devices]')!.checked = true
    review.querySelector<HTMLInputElement>('input[name=reviewReference]')!.value = 'panel-session-01'
    review.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const reference = page.locator('input[name=reviewReference]'); await reference.focus(); await page.keyboard.press('Tab')
  const submit = page.getByRole('button', { name: 'Download private submission' }); await expect(submit).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('details').first()).toHaveAttribute('open', '')
  await expect(page.locator('select[name^="defect-kind-"]').first()).toBeFocused()
  await page.evaluate(() => { const review = document.querySelector<HTMLFormElement>('#review-form')!
    for (const select of review.querySelectorAll<HTMLSelectElement>('select[name^="defect-kind-"]')) select.value = 'clear'
    review.dispatchEvent(new Event('input', { bubbles: true })) })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('input[name=reviewReference]')).toHaveValue('panel-session-01')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download private submission' }).click()
  const download = await downloadEvent; const stream = await download.createReadStream(); const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks)
  const submission = JSON.parse(bytes.toString('utf8')) as unknown
  expect(() => validateCompletedListenerSubmission(submission, browserTemplate, browserListener)).not.toThrow()
  expect(download.suggestedFilename()).toBe(`voice-acceptance-listener-01-${hash(bytes).slice(7)}.json`)
  expect(bytes.toString('utf8')).not.toMatch(/operatorKey|providerId|identityId|candidateClipId|kokoroClipId/u)
  await expect(page.locator('#status')).toHaveText(new RegExp(hash(bytes).slice(7), 'u'))
})

test('opaque local audio reaches loaded metadata', async ({ page }) => {
  await page.goto(pathToFileURL(launchFile).href, { waitUntil: 'domcontentloaded', timeout: 10_000 })
  const media = await page.locator('audio').first().evaluate((audio: HTMLAudioElement) => audio.readyState >= 1 ? 'loaded'
    : audio.error ? 'error' : new Promise<string>((resolve) => {
      audio.addEventListener('loadedmetadata', () => resolve('loaded'), { once: true })
      audio.addEventListener('error', () => resolve('error'), { once: true }); setTimeout(() => resolve('timeout'), 5000); audio.load()
    }))
  expect(media).toBe('loaded')
})
