import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildChirpAuditionPlan, CHIRP_AUDITION_SCHEMA } from './court-week-chirp-audition'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
import { approveVoiceDistinctness, buildVoiceDistinctnessBundle,
  VOICE_DISTINCTNESS_DECISIONS_SCHEMA, voiceReviewDigest } from './court-week-voice-distinctness'
import { buildVoiceAcceptanceBundle, RECURRING_VOICE_IDENTITY_IDS,
  validateVoiceAcceptanceBundle, VOICE_ACCEPTANCE_EXACT_SOURCE_SCHEMA, VOICE_ACCEPTANCE_LOUDNESS_SCHEMA,
  VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA,
  type VoiceAcceptanceSource } from './court-week-voice-acceptance-bundle'

const directory = mkdtempSync(join(tmpdir(), 'simjury-acceptance-'))
afterAll(() => rmSync(directory, { recursive: true }))
const evidenceBytes = new Map<string, Uint8Array>()
const artifact = (kind: string, value: unknown) => { const bytes = new TextEncoder().encode(JSON.stringify(value))
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const path = `content-reviews/voice-acceptance/${kind}-${sha256.slice(7)}.json`; evidenceBytes.set(path, bytes)
  return { path, sha256 } }
const resolveEvidence = (path: string) => { const bytes = evidenceBytes.get(path)
  if (!bytes) throw new Error(`Missing evidence: ${path}`); return bytes }
for (const job of buildChirpAuditionPlan().jobs) {
  const audio = Buffer.from(`test-only:${job.voiceId}`)
  const audioSha256 = `sha256:${createHash('sha256').update(audio).digest('hex')}`
  writeFileSync(join(directory, `${job.jobId}.mp3`), audio)
  writeFileSync(join(directory, `${job.jobId}.json`), JSON.stringify({ schema: CHIRP_AUDITION_SCHEMA,
    jobId: job.jobId, voiceId: job.voiceId, requestSha256: job.requestSha256, audioSha256,
    providerResponse: { bodySha256: `sha256:${'b'.repeat(64)}` } }))
}
const distinctnessBundle = buildVoiceDistinctnessBundle(directory)
const selectedBlindIds = distinctnessBundle.listener.clips.slice(0, 28).map(({ blindId }) => blindId).sort()
const selectedClips = distinctnessBundle.listener.clips.filter(({ blindId }) => selectedBlindIds.includes(blindId))
const assignedBlind = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({ identityId: id, blindId: selectedBlindIds[index]! }))
const sameGenderRankings = selectedBlindIds.map((blindId) => {
  const clip = selectedClips.find((candidate) => candidate.blindId === blindId)!
  return { blindId, rankedBlindIds: selectedClips.filter((candidate) => candidate.blindId !== blindId
    && candidate.presentedGender === clip.presentedGender).map(({ blindId: id }) => id) }
})
const pair = (left: string, right: string): string => [left, right].sort().join('::')
const required = new Set(sameGenderRankings.map(({ blindId, rankedBlindIds }) => pair(blindId, rankedBlindIds[0]!)))
const blindByIdentity = new Map<string, string>(assignedBlind.map(({ identityId, blindId }) => [identityId, blindId]))
for (const adjacent of distinctnessBundle.listener.adjacentRolePairs) required.add(pair(
  blindByIdentity.get(adjacent.leftIdentityId)!, blindByIdentity.get(adjacent.rightIdentityId)!))
const decisions = { schema: VOICE_DISTINCTNESS_DECISIONS_SCHEMA,
  listenerDigest: distinctnessBundle.listener.listenerDigest, selectedBlindIds, assignments: assignedBlind,
  sameGenderRankings, pairDecisions: [...required].sort().map((id) => { const [leftBlindId, rightBlindId] = id.split('::')
    return { leftBlindId: leftBlindId!, rightBlindId: rightBlindId!, distinguishable: true, reviewReference: `test:${id}` } }) }
const approval = approveVoiceDistinctness(distinctnessBundle, decisions)
const voiceByBlind = new Map(distinctnessBundle.operatorKey.voices.map(({ blindId, voiceId }) => [blindId, voiceId]))
const assignments = assignedBlind.map(({ identityId, blindId }) => ({ identityId, voiceId: voiceByBlind.get(blindId)! }))
const recognitionCanonicalTextDigest = voiceReviewDigest('shared neutral recognition transcript')
const nameReviewDigest = voiceReviewDigest('names')
const source: VoiceAcceptanceSource = {
  sourceDigests: { candidateContentDigest: voiceReviewDigest('content'), nameReviewDigest,
    performanceDigest: voiceReviewDigest('performance'), pronunciationDigest: voiceReviewDigest('pronunciation'),
    mediaManifestDigest: voiceReviewDigest('media') }, recognitionCanonicalTextDigest,
  nameProjection: artifact('name-projection', { schema: VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA, nameReviewDigest,
    identities: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({ identityId: id, listenerLabel: `Final voice ${index + 1}` })) }),
  identities: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => { const abCanonicalTextDigest = voiceReviewDigest(['ab-text', id])
    const candidateAudioSha256 = voiceReviewDigest(['candidate', id]); const candidateIntegratedLufs = -18
    const kokoroAudioSha256 = voiceReviewDigest(['rollback', id]); const kokoroIntegratedLufs = -18.4
    const recognitionAudioSha256 = voiceReviewDigest(['recognition', id, index]); const tool = { name: 'test-analyser', version: '1.0.0' }
    const exact = (audioSha256: string, canonicalTextDigest: string) => artifact(`exact-${id}-${audioSha256.slice(7, 11)}`, {
      schema: VOICE_ACCEPTANCE_EXACT_SOURCE_SCHEMA, tool, audioSha256, canonicalTextDigest,
      exactWordMatch: true, reviewReference: `test:${id}` })
    return { identityId: id, abCanonicalTextDigest, candidateAudioSha256, candidateIntegratedLufs,
      kokoroAudioSha256, kokoroIntegratedLufs, recognitionAudioSha256,
      candidateExactSource: exact(candidateAudioSha256, abCanonicalTextDigest),
      kokoroExactSource: exact(kokoroAudioSha256, abCanonicalTextDigest),
      recognitionExactSource: exact(recognitionAudioSha256, recognitionCanonicalTextDigest),
      loudnessAnalysis: artifact(`loudness-${id}`, { schema: VOICE_ACCEPTANCE_LOUDNESS_SCHEMA, tool,
        candidateAudioSha256, kokoroAudioSha256, candidateIntegratedLufs, kokoroIntegratedLufs }) }
  }),
}

describe('five-listener blind voice acceptance bundle', () => {
  it('maps every recurring ledger label to a canonical performance identity', () => {
    expect(RECURRING_VOICE_IDENTITY_IDS).toContain('judge-sel-aven')
    expect(RECURRING_VOICE_IDENTITY_IDS).toContain('asha-renn')
    expect(RECURRING_VOICE_IDENTITY_IDS).toContain('mara-venn')
  })

  it('counterbalances opaque A/B clips and uses approved same-gender recognition cohorts', () => {
    const result = buildVoiceAcceptanceBundle(source, approval, assignments, resolveEvidence)
    expect(result.listener.comparisons).toHaveLength(28)
    expect(result.operatorKey.comparisons.filter(({ candidateClipId }) => candidateClipId.endsWith('-a'))).toHaveLength(14)
    expect(result.operatorKey.comparisons.filter(({ candidateClipId }) => candidateClipId.endsWith('-b'))).toHaveLength(14)
    expect(result.listener.recognitionTrials).toHaveLength(RECURRING_VOICE_IDENTITY_IDS.length)
    expect(result.listener.recognitionTrials.every(({ options }) => options.length === 4)).toBe(true)
    expect(new Set(result.listener.recognitionTrials.map(({ canonicalTextDigest }) => canonicalTextDigest))).toEqual(
      new Set([recognitionCanonicalTextDigest]))
    expect(result.listener.distinctnessComparisons).toHaveLength(approval.requiredPairCount)
    const listenerJson = JSON.stringify(result.listener)
    expect(listenerJson).not.toMatch(/candidateAudioSha256|kokoroAudioSha256|candidateClipId|kokoroClipId|operatorKey|identityId|en-AU-Chirp3-HD-/u)
    for (const { id } of CANONICAL_PERFORMANCE_IDENTITIES) expect(listenerJson).not.toContain(`"${id}"`)
    expect(validateVoiceAcceptanceBundle(
      result.listener, result.operatorKey, source, approval, assignments, resolveEvidence)).toEqual(result)
  })

  it('rejects drifted source digests, unmeasured loudness and mismatched operator keys', () => {
    const loud = structuredClone(source); loud.identities[0]!.kokoroIntegratedLufs = -18.6
    expect(() => buildVoiceAcceptanceBundle(loud, approval, assignments, resolveEvidence)).toThrow(/loudness parity/i)
    const missing = structuredClone(source); missing.sourceDigests.mediaManifestDigest = 'pending'
    expect(() => buildVoiceAcceptanceBundle(missing, approval, assignments, resolveEvidence)).toThrow(/digests are required/i)
    const result = buildVoiceAcceptanceBundle(source, approval, assignments, resolveEvidence)
    const stale = structuredClone(result.operatorKey); stale.comparisons[0]!.candidateClipId = 'ab-01-b'
    expect(() => validateVoiceAcceptanceBundle(
      result.listener, stale, source, approval, assignments, resolveEvidence)).toThrow(/stale or mismatched/i)
    evidenceBytes.set(source.identities[0]!.candidateExactSource.path, new TextEncoder().encode('{}'))
    expect(() => buildVoiceAcceptanceBundle(source, approval, assignments, resolveEvidence)).toThrow(/bytes do not match/i)
  })
})
