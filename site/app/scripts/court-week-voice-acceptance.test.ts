import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildChirpAuditionPlan, CHIRP_AUDITION_SCHEMA } from './court-week-chirp-audition'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
import { approveVoiceDistinctness, buildVoiceDistinctnessBundle,
  VOICE_DISTINCTNESS_DECISIONS_SCHEMA, voiceReviewDigest } from './court-week-voice-distinctness'
import { buildVoiceAcceptanceBundle, VOICE_ACCEPTANCE_EXACT_SOURCE_SCHEMA, VOICE_ACCEPTANCE_LOUDNESS_SCHEMA,
  VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA, type VoiceAcceptanceSource } from './court-week-voice-acceptance-bundle'
import { approveVoiceAcceptance, buildVoiceAcceptanceDecisionTemplate,
  validateVoiceAcceptanceApproval } from './court-week-voice-acceptance'

const directory = mkdtempSync(join(tmpdir(), 'simjury-panel-'))
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
const blindBundle = buildVoiceDistinctnessBundle(directory)
const selected = blindBundle.listener.clips.slice(0, 28).map(({ blindId }) => blindId).sort()
const clips = blindBundle.listener.clips.filter(({ blindId }) => selected.includes(blindId))
const assignedBlind = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({ identityId: id, blindId: selected[index]! }))
const rankings = selected.map((blindId) => { const clip = clips.find((candidate) => candidate.blindId === blindId)!
  return { blindId, rankedBlindIds: clips.filter((candidate) => candidate.blindId !== blindId
    && candidate.presentedGender === clip.presentedGender).map(({ blindId: id }) => id) } })
const pair = (left: string, right: string): string => [left, right].sort().join('::')
const pairs = new Set(rankings.map(({ blindId, rankedBlindIds }) => pair(blindId, rankedBlindIds[0]!)))
const blindByIdentity = new Map<string, string>(assignedBlind.map(({ identityId, blindId }) => [identityId, blindId]))
for (const adjacent of blindBundle.listener.adjacentRolePairs) pairs.add(pair(
  blindByIdentity.get(adjacent.leftIdentityId)!, blindByIdentity.get(adjacent.rightIdentityId)!))
const distinctness = approveVoiceDistinctness(blindBundle, { schema: VOICE_DISTINCTNESS_DECISIONS_SCHEMA,
  listenerDigest: blindBundle.listener.listenerDigest, selectedBlindIds: selected, assignments: assignedBlind, sameGenderRankings: rankings,
  pairDecisions: [...pairs].sort().map((id) => { const [leftBlindId, rightBlindId] = id.split('::')
    return { leftBlindId: leftBlindId!, rightBlindId: rightBlindId!, distinguishable: true, reviewReference: `test:${id}` } }) })
const voiceByBlind = new Map(blindBundle.operatorKey.voices.map(({ blindId, voiceId }) => [blindId, voiceId]))
const assignments = assignedBlind.map(({ identityId, blindId }) => ({ identityId, voiceId: voiceByBlind.get(blindId)! }))
const nameReviewDigest = voiceReviewDigest('names'); const recognitionCanonicalTextDigest = voiceReviewDigest('neutral words')
const source: VoiceAcceptanceSource = { sourceDigests: {
  candidateContentDigest: voiceReviewDigest('content'), nameReviewDigest,
  performanceDigest: voiceReviewDigest('performance'), pronunciationDigest: voiceReviewDigest('pronunciation'),
  mediaManifestDigest: voiceReviewDigest('media') }, recognitionCanonicalTextDigest,
  nameProjection: artifact('name-projection', { schema: VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA, nameReviewDigest,
    identities: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({ identityId: id, listenerLabel: `Final voice ${index + 1}` })) }),
  identities: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }) => { const abCanonicalTextDigest = voiceReviewDigest(['ab-text', id])
    const candidateAudioSha256 = voiceReviewDigest(['candidate', id]); const candidateIntegratedLufs = -18
    const kokoroAudioSha256 = voiceReviewDigest(['rollback', id]); const kokoroIntegratedLufs = -18.2
    const recognitionAudioSha256 = voiceReviewDigest(['recognition', id]); const tool = { name: 'test-analyser', version: '1.0.0' }
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
  }) }
const bundle = buildVoiceAcceptanceBundle(source, distinctness, assignments, resolveEvidence)

function passingDecisions() {
  const decisions = buildVoiceAcceptanceDecisionTemplate(
    bundle.listener, bundle.operatorKey, source, distinctness, assignments, resolveEvidence)
  const comparisonKey = new Map(bundle.operatorKey.comparisons.map((value) => [value.pairId, value]))
  const recognitionKey = new Map(bundle.operatorKey.recognitionTrials.map((value) => [value.trialId, value]))
  decisions.listeners.forEach((listener, index) => {
    listener.blindingConfirmed = true; listener.nativeAustralianEnglishSelfAttested = index < 3
    listener.devices = [['reference-headphones', 'laptop-speakers', 'representative-phone'][index % 3]!]
    listener.clipRatings.forEach((rating) => { rating.naturalness = 4.2
      rating.australianAuthenticity = 4.2; rating.accentAssessment = 'australian' })
    listener.preferences.forEach((preference) => { preference.preferredClipId = comparisonKey.get(preference.pairId)!.candidateClipId })
    listener.recognitionAnswers.forEach((answer) => { answer.selectedChoiceId = recognitionKey.get(answer.trialId)!.correctChoiceId })
    listener.distinctnessDecisions.forEach((decision) => { decision.distinguishable = true })
    listener.defectReviewComplete = true; listener.reviewReference = `blind-panel:${listener.listenerId}`
  })
  return decisions
}

describe('five-listener Australian voice acceptance', () => {
  it('creates exactly five pending blinded records and cannot approve them', () => {
    const decisions = buildVoiceAcceptanceDecisionTemplate(
      bundle.listener, bundle.operatorKey, source, distinctness, assignments, resolveEvidence)
    expect(decisions.listeners).toHaveLength(5)
    expect(decisions.listeners.every((listener) => listener.blindingConfirmed === null
      && listener.nativeAustralianEnglishSelfAttested === null && listener.clipRatings.every(({ naturalness }) => naturalness === null))).toBe(true)
    expect(() => approveVoiceAcceptance(
      bundle.listener, bundle.operatorKey, source, distinctness, assignments, decisions, resolveEvidence)).toThrow(/incomplete/i)
  })

  it('approves a complete panel meeting every locked threshold and exact digest', () => {
    const decisions = passingDecisions()
    const approval = approveVoiceAcceptance(
      bundle.listener, bundle.operatorKey, source, distinctness, assignments, decisions, resolveEvidence)
    expect(approval).toMatchObject({ allowed: true, listenerCount: 5, nativeAustralianListenerCount: 3,
      meanNaturalness: 4.2, candidatePreferenceRate: 1, recognitionRate: 1,
      deviceCoverage: ['reference-headphones', 'laptop-speakers', 'representative-phone'], unresolvedDefectCount: 0 })
    expect(approval.identityResults).toHaveLength(28)
    expect(validateVoiceAcceptanceApproval(
      approval, bundle.listener, bundle.operatorKey, source, distinctness, assignments, decisions, resolveEvidence)).toEqual(approval)
    const forged = { ...approval, meanNaturalness: 5 }
    const payload = Object.fromEntries(Object.entries(forged).filter(([key]) => key !== 'approvalDigest'))
    forged.approvalDigest = voiceReviewDigest(payload)
    expect(() => validateVoiceAcceptanceApproval(
      forged, bundle.listener, bundle.operatorKey, source, distinctness, assignments, decisions, resolveEvidence)).toThrow(/stale/i)
    const driftedDecisions = structuredClone(decisions); driftedDecisions.listeners[0]!.reviewReference = 'blind-panel:changed'
    expect(() => validateVoiceAcceptanceApproval(
      approval, bundle.listener, bundle.operatorKey, source, distinctness, assignments, driftedDecisions, resolveEvidence)).toThrow(/stale/i)
  })

  it('rejects incomplete coverage and every below-threshold aggregate', () => {
    const reject = (mutate: (value: ReturnType<typeof passingDecisions>) => void, pattern: RegExp) => {
      const decisions = passingDecisions(); mutate(decisions)
      expect(() => approveVoiceAcceptance(
        bundle.listener, bundle.operatorKey, source, distinctness, assignments, decisions, resolveEvidence)).toThrow(pattern)
    }
    reject((value) => { value.listeners.pop() }, /exactly five/i)
    reject((value) => value.listeners.forEach((listener, index) => { listener.nativeAustralianEnglishSelfAttested = index < 2 }), /three listeners/i)
    reject((value) => value.listeners.forEach((listener) => { listener.devices = ['reference-headphones'] }), /phone must all be covered/i)
    reject((value) => value.listeners.forEach((listener) => listener.clipRatings.forEach((rating) => { rating.naturalness = 3.9 })), /mean naturalness/i)
    const firstCandidate = bundle.operatorKey.comparisons[0]!.candidateClipId
    reject((value) => value.listeners.forEach((listener) => { listener.clipRatings.find(({ clipId }) => clipId === firstCandidate)!.naturalness = 3.6 }), /below 3.7/i)
    reject((value) => value.listeners.forEach((listener) => { listener.clipRatings.find(({ clipId }) => clipId === firstCandidate)!.australianAuthenticity = 3.9 }), /authenticity/i)
    reject((value) => value.listeners.slice(0, 3).forEach((listener) => { listener.clipRatings.find(({ clipId }) => clipId === firstCandidate)!.accentAssessment = 'not-australian' }), /authenticity/i)
    reject((value) => value.listeners.slice(0, 2).forEach((listener) => listener.preferences.forEach((preference) => {
      preference.preferredClipId = bundle.operatorKey.comparisons.find(({ pairId }) => pairId === preference.pairId)!.kokoroClipId })), /below 70%/i)
    reject((value) => value.listeners[0]!.recognitionAnswers.forEach((answer) => { const trial = bundle.listener.recognitionTrials.find(({ trialId }) => trialId === answer.trialId)!
      answer.selectedChoiceId = trial.options.find(({ choiceId }) => choiceId !== recognitionChoice(answer.trialId))!.choiceId }), /below 90%/i)
    reject((value) => { value.listeners[0]!.distinctnessDecisions[0]!.distinguishable = false }, /not distinguishable/i)
    reject((value) => { value.listeners[0]!.defects.push({ clipId: firstCandidate, kind: 'pronunciation', resolved: false, note: 'Pending' }) }, /unresolved/i)
  })
})

function recognitionChoice(trialId: string): string {
  return bundle.operatorKey.recognitionTrials.find((trial) => trial.trialId === trialId)!.correctChoiceId
}
