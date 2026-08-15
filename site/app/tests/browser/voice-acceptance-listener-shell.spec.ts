import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { createPrivateListenerReviewShell } from '../../scripts/court-week-voice-acceptance-listener-shell'
import { voiceReviewDigest } from '../../scripts/court-week-voice-distinctness'

const hash = (value: Uint8Array | string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const roots: string[] = []; let launchFile = ''
const directory = (name: string) => { const value = mkdtempSync(join(tmpdir(), `simjury-${name}-`)); roots.push(value); return value }
const mp3 = (sample: number) => { const value = Buffer.alloc(417 * 8 + 128)
  for (let offset = 0; offset < 417 * 8; offset += 417) Buffer.from([0xff, 0xfb, 0x90, 0x00]).copy(value, offset)
  value.write('TAG', 417 * 8); value.write(`Opaque ${sample}`, 417 * 8 + 3); return value }

test.beforeAll(() => {
  const source = directory('listener-browser-source'); const output = directory('listener-browser-output'); let ordinal = 0
  const clip = (clipId: string) => { const bytes = mp3(++ordinal); writeFileSync(join(source, `${clipId}.mp3`), bytes)
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
  const listener = { ...payload, bundleDigest: voiceReviewDigest(payload) }
  const decision = { listenerId: 'listener-01', blindingConfirmed: null, nativeAustralianEnglishSelfAttested: null,
    devices: [], clipRatings: comparisons.flatMap(({ roleId, clips }) => clips.map(({ clipId }) => ({ roleId, clipId,
      naturalness: null, australianAuthenticity: null, accentAssessment: null }))),
    preferences: comparisons.map(({ pairId }) => ({ pairId, preferredClipId: null })),
    recognitionAnswers: recognitionTrials.map(({ trialId }) => ({ trialId, selectedChoiceId: null })),
    distinctnessDecisions: [{ pairId: 'distinctness-001', distinguishable: null }],
    defectReviewComplete: false, defects: [], reviewReference: '' }
  writeFileSync(join(source, 'listener.json'), JSON.stringify(listener)); writeFileSync(join(source,
    'submission-listener-01.json'), JSON.stringify({ schema: 'simjury.court-week-voice-acceptance-listener-submission/v1',
    bundleDigest: listener.bundleDigest, listener: decision }))
  launchFile = createPrivateListenerReviewShell(source, output, 'submission-listener-01.json', listener.bundleDigest).launchFile
})
test.afterAll(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

test('private listener shell runs from file with local scripts and audio while CSP blocks connections', async ({ page }) => {
  const outbound: string[] = []; page.on('request', (request) => { if (/^https?:/u.test(request.url())) outbound.push(request.url()) })
  await page.route('https://example.invalid/**', (route) => route.abort())
  await page.goto(pathToFileURL(launchFile).href, { waitUntil: 'domcontentloaded', timeout: 10_000 })
  await expect(page.locator('#status')).toHaveText(/Package ready/u); await expect(page.locator('#clips')).toHaveText('82')
  const media = await page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.readyState >= 1 ? 'loaded' : audio.error ? 'error'
    : new Promise<string>((resolve) => { audio.addEventListener('loadedmetadata', () => resolve('loaded'), { once: true })
      audio.addEventListener('error', () => resolve('error'), { once: true }); setTimeout(() => resolve('timeout'), 5000); audio.load() }))
  expect(media).toBe('loaded')
  expect(await page.evaluate(async () => Promise.race([fetch('https://example.invalid/csp-probe').then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))]))).toBe(false)
  expect(outbound).toEqual([])
})
