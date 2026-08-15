import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceAcceptanceBundle } from './court-week-voice-acceptance-bundle'

const mocks = vi.hoisted(() => ({ validate: vi.fn() }))
vi.mock('./court-week-voice-acceptance-bundle', () => ({ validateVoiceAcceptanceBundle: mocks.validate }))

import { buildCompletedListenerDownload, exportPrivateVoiceAcceptance, pendingListenerSubmissions,
  readPrivateExportRequest, validateCompletedListenerSubmission } from './court-week-voice-acceptance-export'
import { createPrivateListenerReviewShell } from './court-week-voice-acceptance-listener-shell'
import { voiceReviewDigest } from './court-week-voice-distinctness'

const temporary: string[] = []
const digest = (bytes: Uint8Array | string): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const audio = new Map<string, Buffer>()
const clip = (clipId: string) => {
  const bytes = Buffer.from(`private-${clipId}`); const audioSha256 = digest(bytes)
  audio.set(audioSha256, bytes)
  return { clipId, audioSha256, integratedLufs: -18, exactSourceEvidenceSha256: digest(`source-${clipId}`),
    loudnessAnalysisEvidenceSha256: digest(`loudness-${clipId}`) }
}
const listenerPayload = {
  schema: 'simjury.court-week-voice-acceptance-bundle/v1', blinded: true,
  sourceDigests: Object.fromEntries(['candidateContentDigest', 'mediaManifestDigest', 'nameReviewDigest',
    'performanceDigest', 'pronunciationDigest'].map((key) => [key, digest(key)])), distinctnessApprovalDigest: digest('distinctness'),
  castingContractDigest: digest('casting'), assignmentDigest: digest('assignment'),
  comparisons: Array.from({ length: 28 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0')
    return { roleId: `role-${ordinal}`, listenerLabel: `Final voice ${index + 1}`, pairId: `ab-${ordinal}`,
      canonicalTextDigest: digest(`text-${ordinal}`), clips: [clip(`ab-${ordinal}-a`), clip(`ab-${ordinal}-b`)] }
  }),
  recognitionTrials: Array.from({ length: 26 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0'); const sample = clip(`recognition-${ordinal}-sample`)
    return { trialId: `recognition-${ordinal}`, sampleClipId: sample.clipId,
      sampleAudioSha256: sample.audioSha256, canonicalTextDigest: digest('neutral'),
      exactSourceEvidenceSha256: digest(`recognition-source-${ordinal}`),
      options: Array.from({ length: 4 }, (_value, option) => ({
        choiceId: `recognition-${ordinal}-choice-${option + 1}`, listenerLabel: `Voice ${option + 1}` })) }
  }),
  distinctnessComparisons: [{ pairId: 'distinctness-001', clipIds: ['ab-01-a', 'ab-02-a'] }],
}
const listener = { ...listenerPayload, bundleDigest: voiceReviewDigest(listenerPayload) } as unknown as VoiceAcceptanceBundle
const bundleDigest = listener.bundleDigest
const operatorKey = { schema: 'simjury.court-week-voice-acceptance-operator-key/v1',
  operatorKeyDigest: digest('operator'), comparisons: [{ identityId: 'legacy-private-id', candidateClipId: 'ab-01-a' }] }
const request = { listener, operatorKey, source: {}, distinctnessApproval: {}, assignments: [] }

function directory(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `simjury-${name}-`)); temporary.push(root); return root
}
function fixture() {
  const audioRoot = directory('acceptance-audio'); const evidenceRoot = directory('acceptance-evidence')
  const listenerOutput = directory('acceptance-listener'); const operatorOutput = directory('acceptance-operator')
  for (const [sha256, bytes] of audio) writeFileSync(join(audioRoot, `${sha256.slice(7)}.mp3`), bytes)
  const evidencePath = 'content-reviews/voice-acceptance/proof.json'
  mkdirSync(join(evidenceRoot, 'content-reviews/voice-acceptance'), { recursive: true })
  writeFileSync(join(evidenceRoot, evidencePath), '{}')
  mocks.validate.mockReturnValue({ listener, operatorKey })
  return { audioRoot, evidenceRoot, listenerOutput, operatorOutput }
}
function reviewFixture() {
  const paths = fixture(); exportPrivateVoiceAcceptance(request, paths)
  return { paths, output: directory('acceptance-review') }
}

afterEach(() => { for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true }) })
beforeEach(() => mocks.validate.mockReset())

describe('private five-listener acceptance export', () => {
  it('copies exactly 82 opaque clips and keeps the operator key physically separate', () => {
    const paths = fixture()
    expect(exportPrivateVoiceAcceptance(request, paths)).toEqual({ bundleDigest, clipCount: 82, listenerTemplateCount: 5 })
    expect(readdirSync(paths.listenerOutput)).toHaveLength(88)
    expect(readdirSync(paths.operatorOutput)).toEqual(['operator-key.json'])
    const listenerFiles = readdirSync(paths.listenerOutput).map((file) => readFileSync(join(paths.listenerOutput, file)))
    const listenerBytes = Buffer.concat(listenerFiles).toString()
    expect(listenerBytes).not.toMatch(/legacy-private-id|candidateClipId|operator-key/u)
    expect(listenerBytes).toContain('simjury.court-week-voice-acceptance-listener-submission/v1')
    expect(readFileSync(join(paths.operatorOutput, 'operator-key.json'), 'utf8')).toContain('legacy-private-id')
    expect(readFileSync(join(paths.listenerOutput, 'ab-01-a.mp3')))
      .toEqual(audio.get(String(listener.comparisons[0]!.clips[0]!.audioSha256)))
  })

  it('emits only pending answers, then requires a real device on completed intake', () => {
    fixture()
    const { submissions } = pendingListenerSubmissions(request, () => Buffer.from('{}'))
    const pending = submissions[0]!
    expect(pending.listener).toMatchObject({ blindingConfirmed: null, devices: [], defectReviewComplete: false })
    expect(() => validateCompletedListenerSubmission(pending, pending, listener)).toThrow(/empty device evidence/i)
    const complete = structuredClone(pending); const record = complete.listener
    record.blindingConfirmed = true; record.nativeAustralianEnglishSelfAttested = true
    record.devices = ['representative-phone']; record.defectReviewComplete = true; record.reviewReference = 'panel:receipt'
    record.clipRatings.forEach((rating) => { rating.naturalness = 4; rating.australianAuthenticity = 4
      rating.accentAssessment = 'australian' })
    record.preferences.forEach((answer) => { answer.preferredClipId = 'tie' })
    record.recognitionAnswers.forEach((answer) => { answer.selectedChoiceId = `${answer.trialId}-choice-1` })
    record.distinctnessDecisions.forEach((answer) => { answer.distinguishable = true })
    expect(validateCompletedListenerSubmission(complete, pending, listener)).toEqual(complete)
    const leaked = structuredClone(complete)
    Object.assign(leaked.listener.clipRatings[0]!, { identityId: 'legacy-private-id' })
    expect(() => validateCompletedListenerSubmission(leaked, pending, listener)).toThrow(/incomplete/i)
  })

  it('builds a deterministic content-addressed strict submission', async () => {
    fixture(); const { submissions } = pendingListenerSubmissions(request, () => Buffer.from('{}'))
    const pending = submissions[0]!; const record = structuredClone(pending.listener)
    record.blindingConfirmed = true; record.nativeAustralianEnglishSelfAttested = false
    record.devices = ['laptop-speakers']; record.defectReviewComplete = true; record.reviewReference = 'panel:receipt'
    record.clipRatings.forEach((rating) => { rating.naturalness = 4; rating.australianAuthenticity = 4
      rating.accentAssessment = 'australian' })
    record.preferences.forEach((answer) => { answer.preferredClipId = 'tie' })
    record.recognitionAnswers.forEach((answer) => { answer.selectedChoiceId = `${answer.trialId}-choice-1` })
    record.distinctnessDecisions.forEach((answer) => { answer.distinguishable = true })
    const first = await buildCompletedListenerDownload(record, pending, listener)
    const second = await buildCompletedListenerDownload(structuredClone(record), pending, listener)
    expect(second).toEqual(first); expect(digest(first.json)).toBe(first.digest)
    expect(first.filename).toBe(`voice-acceptance-listener-01-${first.digest.slice(7)}.json`)
    expect(validateCompletedListenerSubmission(JSON.parse(first.json), pending, listener)).toEqual(first.submission)
  })

  it('builds a sealed no-connect review shell without private routing data', () => {
    const { paths, output } = reviewFixture()
    const result = createPrivateListenerReviewShell(paths.listenerOutput, output, 'submission-listener-01.json', bundleDigest)
    expect(result).toMatchObject({ bundleDigest, listenerId: 'listener-01', clipCount: 82 })
    const assets = readdirSync(output).filter((name) => !name.endsWith('.mp3'))
      .map((name) => readFileSync(join(output, name), 'utf8')).join('\n')
    expect(assets).toContain("connect-src 'none'"); expect(assets).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|serviceWorker/iu)
    expect(assets).not.toMatch(/legacy-private-id|candidateClipId|operatorKey|identityId|providerId/iu)
    expect(assets).toContain(bundleDigest); expect(assets).toContain(result.packageDigest)
    expect(() => createPrivateListenerReviewShell(paths.listenerOutput, directory('review-wrong'),
      'submission-listener-01.json', digest('wrong'))).toThrow(/exact|matched|unanswered/i)
    expect(() => createPrivateListenerReviewShell(paths.listenerOutput, directory('review-missing'),
      'submission-listener-01.json', '')).toThrow(/exact|matched|unanswered/i)
  })

  it('rejects stale, missing or extra review audio before copying any clip', () => {
    const stale = reviewFixture(); writeFileSync(join(stale.paths.listenerOutput, 'ab-01-a.mp3'), 'changed')
    expect(() => createPrivateListenerReviewShell(stale.paths.listenerOutput, stale.output,
      'submission-listener-01.json', bundleDigest)).toThrow(/audio SHA-256 is stale/i)
    expect(readdirSync(stale.output)).toEqual([])
    const missing = reviewFixture(); rmSync(join(missing.paths.listenerOutput, 'ab-01-a.mp3'))
    expect(() => createPrivateListenerReviewShell(missing.paths.listenerOutput, missing.output,
      'submission-listener-01.json', bundleDigest)).toThrow(/exactly the expected 82/i)
    const extra = reviewFixture(); writeFileSync(join(extra.paths.listenerOutput, 'extra.mp3'), 'extra')
    expect(() => createPrivateListenerReviewShell(extra.paths.listenerOutput, extra.output,
      'submission-listener-01.json', bundleDigest)).toThrow(/exactly the expected 82/i)
  })

  it('rejects answered, identity-bearing or outbound listener data', () => {
    const answered = reviewFixture(); const answeredPath = join(answered.paths.listenerOutput, 'submission-listener-01.json')
    const template = JSON.parse(readFileSync(answeredPath, 'utf8')); template.listener.blindingConfirmed = true
    writeFileSync(answeredPath, JSON.stringify(template)); expect(() => createPrivateListenerReviewShell(
      answered.paths.listenerOutput, answered.output, 'submission-listener-01.json', bundleDigest)).toThrow(/unanswered/i)
    const leaked = reviewFixture(); const leakedPath = join(leaked.paths.listenerOutput, 'submission-listener-01.json')
    const leakedTemplate = JSON.parse(readFileSync(leakedPath, 'utf8')); leakedTemplate.listener.identityId = 'private'
    writeFileSync(leakedPath, JSON.stringify(leakedTemplate)); expect(() => createPrivateListenerReviewShell(
      leaked.paths.listenerOutput, leaked.output, 'submission-listener-01.json', bundleDigest)).toThrow(/unanswered|routing field/i)
    const outbound = reviewFixture(); const listenerPath = join(outbound.paths.listenerOutput, 'listener.json')
    const changed = JSON.parse(readFileSync(listenerPath, 'utf8')); changed.comparisons[0].listenerLabel = 'https://example.invalid'
    delete changed.bundleDigest; changed.bundleDigest = voiceReviewDigest(changed)
    const selected = join(outbound.paths.listenerOutput, 'submission-listener-01.json')
    const selectedTemplate = JSON.parse(readFileSync(selected, 'utf8')); selectedTemplate.bundleDigest = changed.bundleDigest
    writeFileSync(listenerPath, JSON.stringify(changed)); writeFileSync(selected, JSON.stringify(selectedTemplate))
    expect(() => createPrivateListenerReviewShell(outbound.paths.listenerOutput, outbound.output,
      'submission-listener-01.json', changed.bundleDigest)).toThrow(/Outbound URLs/i)
  })

  it('rejects extra top-level or nested personal metadata even when re-digested', () => {
    for (const [path, value] of [['email', 'listener@example.invalid'], ['comparisons.0.personName', 'Private Person']]) {
      const item = reviewFixture(); const listenerPath = join(item.paths.listenerOutput, 'listener.json')
      const changed = JSON.parse(readFileSync(listenerPath, 'utf8')); if (path === 'email') changed.email = value
      else changed.comparisons[0].personName = value
      delete changed.bundleDigest; changed.bundleDigest = voiceReviewDigest(changed)
      const selected = join(item.paths.listenerOutput, 'submission-listener-01.json')
      const selectedTemplate = JSON.parse(readFileSync(selected, 'utf8')); selectedTemplate.bundleDigest = changed.bundleDigest
      writeFileSync(listenerPath, JSON.stringify(changed)); writeFileSync(selected, JSON.stringify(selectedTemplate))
      expect(() => createPrivateListenerReviewShell(item.paths.listenerOutput, item.output,
        'submission-listener-01.json', changed.bundleDigest)).toThrow(/exact|matched|unanswered/i)
    }
  })

  it('fails closed on answers, altered audio, unexpected files and overlapping outputs', () => {
    const answered = { ...request, decisions: { listeners: [] } }
    expect(() => pendingListenerSubmissions(answered, () => Buffer.from('{}'))).toThrow(/answers are forbidden/i)
    const altered = fixture(); const first = String(listener.comparisons[0]!.clips[0]!.audioSha256)
    writeFileSync(join(altered.audioRoot, `${first.slice(7)}.mp3`), 'changed')
    expect(() => exportPrivateVoiceAcceptance(request, altered)).toThrow(/bytes do not match/i)
    const unexpected = fixture(); writeFileSync(join(unexpected.audioRoot, 'extra.mp3'), 'extra')
    expect(() => exportPrivateVoiceAcceptance(request, unexpected)).toThrow(/exactly the expected 82/i)
    const overlap = fixture()
    expect(() => exportPrivateVoiceAcceptance(request, { ...overlap, operatorOutput: overlap.listenerOutput }))
      .toThrow(/must not overlap/i)
  })

  it('rejects a symlink or reparse point as a private root when the platform permits it', () => {
    const target = directory('acceptance-real-root'); const link = join(directory('acceptance-link-parent'), 'link')
    try { symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir') } catch { return }
    const paths = fixture()
    expect(() => exportPrivateVoiceAcceptance(request, { ...paths, audioRoot: link })).toThrow(/reparse point/i)
    const review = reviewFixture()
    expect(() => createPrivateListenerReviewShell(review.paths.listenerOutput, link,
      'submission-listener-01.json', bundleDigest)).toThrow(/reparse point/i)
  })

  it('never writes a review shell inside a repository or public tree', () => {
    const review = reviewFixture()
    expect(() => createPrivateListenerReviewShell(review.paths.listenerOutput, process.cwd(),
      'submission-listener-01.json', bundleDigest)).toThrow(/outside every repository/i)
    const publicOutput = join(directory('acceptance-parent'), 'public'); mkdirSync(publicOutput)
    expect(() => createPrivateListenerReviewShell(review.paths.listenerOutput, publicOutput,
      'submission-listener-01.json', bundleDigest)).toThrow(/public tree/i)
  })

  it('never reads the operator-bearing request from the repository or a reparse point', () => {
    expect(() => readPrivateExportRequest(import.meta.filename)).toThrow(/outside the repository/i)
    const privateRoot = directory('acceptance-private-request'); const requestFile = join(privateRoot, 'request.json')
    const link = join(privateRoot, 'request-link.json'); writeFileSync(requestFile, '{}')
    try { symlinkSync(requestFile, link, 'file') } catch { return }
    expect(() => readPrivateExportRequest(link)).toThrow(/reparse point/i)
  })
})
