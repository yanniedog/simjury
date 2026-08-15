import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceAcceptanceBundle } from './court-week-voice-acceptance-bundle'

const mocks = vi.hoisted(() => ({ validate: vi.fn() }))
vi.mock('./court-week-voice-acceptance-bundle', () => ({ validateVoiceAcceptanceBundle: mocks.validate }))

import { exportPrivateVoiceAcceptance, pendingListenerSubmissions,
  readPrivateExportRequest, validateCompletedListenerSubmission } from './court-week-voice-acceptance-export'

const temporary: string[] = []
const digest = (bytes: Uint8Array | string): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const bundleDigest = digest('bundle')
const audio = new Map<string, Buffer>()
const clip = (clipId: string) => {
  const bytes = Buffer.from(`private-${clipId}`); const audioSha256 = digest(bytes)
  audio.set(audioSha256, bytes)
  return { clipId, audioSha256, integratedLufs: -18, exactSourceEvidenceSha256: digest(`source-${clipId}`),
    loudnessAnalysisEvidenceSha256: digest(`loudness-${clipId}`) }
}
const listener = {
  schema: 'simjury.court-week-voice-acceptance-bundle/v1', blinded: true,
  sourceDigests: {}, distinctnessApprovalDigest: digest('distinctness'),
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
  bundleDigest,
} as unknown as VoiceAcceptanceBundle
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
  })

  it('never reads the operator-bearing request from the repository or a reparse point', () => {
    expect(() => readPrivateExportRequest(import.meta.filename)).toThrow(/outside the repository/i)
    const privateRoot = directory('acceptance-private-request'); const requestFile = join(privateRoot, 'request.json')
    const link = join(privateRoot, 'request-link.json'); writeFileSync(requestFile, '{}')
    try { symlinkSync(requestFile, link, 'file') } catch { return }
    expect(() => readPrivateExportRequest(link)).toThrow(/reparse point/i)
  })
})
