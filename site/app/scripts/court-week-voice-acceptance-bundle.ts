import { createHash } from 'node:crypto'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
import { buildCourtWeekSpeechReviewLedger } from '../src/courtweek/content/speechReviewLedger'
import {
  validateVoiceDistinctnessApproval, voiceReviewDigest,
} from './court-week-voice-distinctness'

export const VOICE_ACCEPTANCE_BUNDLE_SCHEMA = 'simjury.court-week-voice-acceptance-bundle/v1' as const
export const VOICE_ACCEPTANCE_OPERATOR_KEY_SCHEMA = 'simjury.court-week-voice-acceptance-operator-key/v1' as const
export const VOICE_ACCEPTANCE_EXACT_SOURCE_SCHEMA = 'simjury.court-week-voice-exact-source/v1' as const
export const VOICE_ACCEPTANCE_LOUDNESS_SCHEMA = 'simjury.court-week-voice-loudness-analysis/v1' as const
export const VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA = 'simjury.court-week-voice-name-projection/v1' as const
export const MAX_LOUDNESS_DELTA_LUFS = 0.5
const sha256 = /^sha256:[0-9a-f]{64}$/u
const identityIds: string[] = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }) => id)
const identityByLabel = new Map<string, string>(CANONICAL_PERFORMANCE_IDENTITIES.flatMap(({ id, speakerLabels }) =>
  speakerLabels.map((label) => [label, id] as const)))
const turnCounts = new Map<string, number>()
for (const { displayLabel } of buildCourtWeekSpeechReviewLedger().rows) {
  const identityId = identityByLabel.get(displayLabel)
  if (!identityId) throw new Error(`Speech review label has no performance identity: ${displayLabel}`)
  turnCounts.set(identityId, (turnCounts.get(identityId) ?? 0) + 1)
}
export const RECURRING_VOICE_IDENTITY_IDS = identityIds.filter((id) => (turnCounts.get(id) ?? 0) > 1)

export interface VoiceAcceptanceSource {
  sourceDigests: {
    candidateContentDigest: string; nameReviewDigest: string; performanceDigest: string
    pronunciationDigest: string; mediaManifestDigest: string
  }
  nameProjection: EvidenceArtifact; recognitionCanonicalTextDigest: string
  identities: {
    identityId: string; abCanonicalTextDigest: string; candidateAudioSha256: string; candidateIntegratedLufs: number
    kokoroAudioSha256: string; kokoroIntegratedLufs: number
    recognitionAudioSha256: string; candidateExactSource: EvidenceArtifact; kokoroExactSource: EvidenceArtifact
    recognitionExactSource: EvidenceArtifact; loudnessAnalysis: EvidenceArtifact
  }[]
}
export type EvidenceArtifact = { path: string; sha256: string }
export type VoiceAcceptanceEvidenceResolver = (path: string) => Uint8Array
export type VoiceAcceptanceBundle = ReturnType<typeof buildVoiceAcceptanceBundle>['listener']
export type VoiceAcceptanceOperatorKey = ReturnType<typeof buildVoiceAcceptanceBundle>['operatorKey']
const exact = (left: unknown, right: unknown): boolean => voiceReviewDigest(left) === voiceReviewDigest(right)
const clipId = (index: number, side: 'a' | 'b'): string => `ab-${String(index + 1).padStart(2, '0')}-${side}`
const bytesDigest = (value: Uint8Array): string => `sha256:${createHash('sha256').update(value).digest('hex')}`

function loadEvidence(artifact: EvidenceArtifact, resolveEvidence: VoiceAcceptanceEvidenceResolver): Record<string, unknown> {
  if (!artifact || !sha256.test(artifact.sha256)
    || !/^content-reviews\/voice-acceptance\/[a-z0-9-]+-[0-9a-f]{64}\.json$/u.test(artifact.path)
    || !artifact.path.includes(artifact.sha256.slice(7))) throw new Error('Voice acceptance evidence must be content-addressed review JSON')
  const bytes = resolveEvidence(artifact.path)
  if (!(bytes instanceof Uint8Array) || bytesDigest(bytes) !== artifact.sha256) {
    throw new Error('Voice acceptance evidence bytes do not match their SHA-256')
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>
}
function assertExactSource(artifact: EvidenceArtifact, audioSha256: string, canonicalTextDigest: string,
  resolveEvidence: VoiceAcceptanceEvidenceResolver): void {
  const receipt = loadEvidence(artifact, resolveEvidence); const tool = receipt.tool as Record<string, unknown> | undefined
  if (receipt.schema !== VOICE_ACCEPTANCE_EXACT_SOURCE_SCHEMA || receipt.audioSha256 !== audioSha256
    || receipt.canonicalTextDigest !== canonicalTextDigest || receipt.exactWordMatch !== true
    || typeof tool?.name !== 'string' || !tool.name || typeof tool.version !== 'string' || !tool.version
    || typeof receipt.reviewReference !== 'string' || !receipt.reviewReference) throw new Error('Exact-source evidence is missing or stale')
}
function assertLoudness(entry: VoiceAcceptanceSource['identities'][number], resolveEvidence: VoiceAcceptanceEvidenceResolver): void {
  const receipt = loadEvidence(entry.loudnessAnalysis, resolveEvidence); const tool = receipt.tool as Record<string, unknown> | undefined
  if (receipt.schema !== VOICE_ACCEPTANCE_LOUDNESS_SCHEMA || typeof tool?.name !== 'string' || !tool.name
    || typeof tool.version !== 'string' || !tool.version || receipt.candidateAudioSha256 !== entry.candidateAudioSha256
    || receipt.kokoroAudioSha256 !== entry.kokoroAudioSha256 || receipt.candidateIntegratedLufs !== entry.candidateIntegratedLufs
    || receipt.kokoroIntegratedLufs !== entry.kokoroIntegratedLufs) throw new Error('Loudness-analysis evidence is missing or stale')
}
function finalLabels(source: VoiceAcceptanceSource, resolveEvidence: VoiceAcceptanceEvidenceResolver): Map<string, string> {
  const receipt = loadEvidence(source.nameProjection, resolveEvidence)
  const identities = receipt.identities as { identityId: string; listenerLabel: string }[] | undefined
  if (receipt.schema !== VOICE_ACCEPTANCE_NAME_PROJECTION_SCHEMA
    || receipt.nameReviewDigest !== source.sourceDigests.nameReviewDigest
    || !exact(identities?.map(({ identityId }) => identityId), identityIds)
    || identities?.some(({ listenerLabel }) => typeof listenerLabel !== 'string' || !listenerLabel.trim())
    || new Set(identities?.map(({ listenerLabel }) => listenerLabel)).size !== 28) {
    throw new Error('Final listener labels do not match the reviewed name projection')
  }
  return new Map(identities!.map(({ identityId, listenerLabel }) => [identityId, listenerLabel]))
}

function validateSource(source: VoiceAcceptanceSource, resolveEvidence: VoiceAcceptanceEvidenceResolver): void {
  const digestFields = ['candidateContentDigest', 'mediaManifestDigest', 'nameReviewDigest', 'performanceDigest', 'pronunciationDigest']
  if (!source || !exact(Object.keys(source.sourceDigests ?? {}).sort(), digestFields)
    || !sha256.test(source.recognitionCanonicalTextDigest)
    || Object.values(source.sourceDigests).some((value) => !sha256.test(value))) {
    throw new Error('Final candidate, name, performance, pronunciation and media digests are required')
  }
  if (!exact(source.identities?.map(({ identityId }) => identityId), identityIds)
    || source.identities.length !== 28
    || new Set(source.identities.map(({ candidateAudioSha256 }) => candidateAudioSha256)).size !== 28
    || new Set(source.identities.map(({ recognitionAudioSha256 }) => recognitionAudioSha256)).size !== 28
    || source.identities.some((entry) => !sha256.test(entry.abCanonicalTextDigest) || !sha256.test(entry.candidateAudioSha256)
      || !sha256.test(entry.kokoroAudioSha256) || !sha256.test(entry.recognitionAudioSha256)
      || !Number.isFinite(entry.candidateIntegratedLufs) || !Number.isFinite(entry.kokoroIntegratedLufs)
      || entry.candidateIntegratedLufs < -30 || entry.candidateIntegratedLufs > -10
      || entry.kokoroIntegratedLufs < -30 || entry.kokoroIntegratedLufs > -10
      || Math.abs(entry.candidateIntegratedLufs - entry.kokoroIntegratedLufs) > MAX_LOUDNESS_DELTA_LUFS)) {
    throw new Error('All 28 identities require unique audio, measured loudness parity and hash-bound analysis receipts')
  }
  finalLabels(source, resolveEvidence)
  for (const entry of source.identities) {
    assertExactSource(entry.candidateExactSource, entry.candidateAudioSha256, entry.abCanonicalTextDigest, resolveEvidence)
    assertExactSource(entry.kokoroExactSource, entry.kokoroAudioSha256, entry.abCanonicalTextDigest, resolveEvidence)
    assertExactSource(entry.recognitionExactSource, entry.recognitionAudioSha256, source.recognitionCanonicalTextDigest, resolveEvidence)
    assertLoudness(entry, resolveEvidence)
  }
}

export function buildVoiceAcceptanceBundle(
  source: VoiceAcceptanceSource, distinctnessInput: unknown, assignments: readonly unknown[],
  resolveEvidence: VoiceAcceptanceEvidenceResolver,
) {
  validateSource(source, resolveEvidence)
  const distinctness = validateVoiceDistinctnessApproval(distinctnessInput, assignments)
  const nameByIdentity = finalLabels(source, resolveEvidence)
  const comparisons = source.identities.map((entry, index) => {
    const candidateSide = index % 2 === 0 ? 'a' : 'b'; const kokoroSide = candidateSide === 'a' ? 'b' : 'a'
    const values = {
      a: candidateSide === 'a' ? [entry.candidateAudioSha256, entry.candidateIntegratedLufs]
        : [entry.kokoroAudioSha256, entry.kokoroIntegratedLufs],
      b: candidateSide === 'b' ? [entry.candidateAudioSha256, entry.candidateIntegratedLufs]
        : [entry.kokoroAudioSha256, entry.kokoroIntegratedLufs],
    } as const
    return {
      identityId: entry.identityId, roleId: `role-${String(index + 1).padStart(2, '0')}`,
      listenerLabel: nameByIdentity.get(entry.identityId)!, pairId: `ab-${String(index + 1).padStart(2, '0')}`,
      canonicalTextDigest: entry.abCanonicalTextDigest,
      clips: (['a', 'b'] as const).map((side) => ({ clipId: clipId(index, side), audioSha256: values[side][0],
        integratedLufs: values[side][1], exactSourceEvidenceSha256: side === candidateSide
          ? entry.candidateExactSource.sha256 : entry.kokoroExactSource.sha256,
        loudnessAnalysisEvidenceSha256: entry.loudnessAnalysis.sha256 })),
      operator: { candidateClipId: clipId(index, candidateSide), kokoroClipId: clipId(index, kokoroSide) },
    }
  })
  const comparisonByIdentity = new Map(comparisons.map((comparison) => [comparison.identityId, comparison]))
  const cohortByIdentity = new Map(distinctness.recognitionCohorts.map((cohort) => [cohort.identityId, cohort]))
  const recognitionTrials = RECURRING_VOICE_IDENTITY_IDS.map((targetIdentityId, index) => {
    const identities = [...cohortByIdentity.get(targetIdentityId)!.distractorIdentityIds]
    identities.splice(index % 4, 0, targetIdentityId)
    return {
      trialId: `recognition-${String(index + 1).padStart(2, '0')}`,
      sampleClipId: `recognition-${String(index + 1).padStart(2, '0')}-sample`,
      sampleAudioSha256: source.identities.find(({ identityId }) => identityId === targetIdentityId)!.recognitionAudioSha256,
      canonicalTextDigest: source.recognitionCanonicalTextDigest,
      exactSourceEvidenceSha256: source.identities.find(({ identityId }) => identityId === targetIdentityId)!.recognitionExactSource.sha256,
      options: identities.map((identityId, optionIndex) => ({
        choiceId: `recognition-${String(index + 1).padStart(2, '0')}-choice-${optionIndex + 1}`,
        listenerLabel: nameByIdentity.get(identityId)!, identityId,
      })),
      operator: { targetIdentityId },
    }
  })
  const distinctnessComparisons = distinctness.requiredIdentityPairs.map((pair, index) => ({
    pairId: `distinctness-${String(index + 1).padStart(3, '0')}`,
    clipIds: [comparisonByIdentity.get(pair.leftIdentityId)!.operator.candidateClipId,
      comparisonByIdentity.get(pair.rightIdentityId)!.operator.candidateClipId], operator: pair,
  }))
  const listenerPayload = {
    schema: VOICE_ACCEPTANCE_BUNDLE_SCHEMA, blinded: true as const,
    sourceDigests: source.sourceDigests, distinctnessApprovalDigest: distinctness.approvalDigest,
    castingContractDigest: distinctness.castingContractDigest, assignmentDigest: distinctness.assignmentDigest,
    comparisons: comparisons.map(({ roleId, listenerLabel, pairId, canonicalTextDigest, clips }) => (
      { roleId, listenerLabel, pairId, canonicalTextDigest, clips })),
    recognitionTrials: recognitionTrials.map(({ trialId, sampleClipId, sampleAudioSha256,
      canonicalTextDigest, exactSourceEvidenceSha256, options }) => (
      { trialId, sampleClipId, sampleAudioSha256, canonicalTextDigest, exactSourceEvidenceSha256,
        options: options.map(({ choiceId, listenerLabel }) => ({ choiceId, listenerLabel })) })),
    distinctnessComparisons: distinctnessComparisons.map(({ pairId, clipIds }) => ({ pairId, clipIds })),
  }
  const listener = { ...listenerPayload, bundleDigest: voiceReviewDigest(listenerPayload) }
  const operatorPayload = {
    schema: VOICE_ACCEPTANCE_OPERATOR_KEY_SCHEMA, bundleDigest: listener.bundleDigest,
    comparisons: comparisons.map(({ identityId, roleId, pairId, operator }) => ({ identityId, roleId, pairId, ...operator })),
    recognitionTrials: recognitionTrials.map(({ trialId, options, operator }) => ({ trialId, ...operator,
      correctChoiceId: options.find(({ identityId }) => identityId === operator.targetIdentityId)!.choiceId })),
    distinctnessComparisons: distinctnessComparisons.map(({ pairId, operator }) => ({ pairId, ...operator })),
  }
  return { listener, operatorKey: { ...operatorPayload, operatorKeyDigest: voiceReviewDigest(operatorPayload) } }
}

export function validateVoiceAcceptanceBundle(
  listenerInput: unknown, operatorInput: unknown, source: VoiceAcceptanceSource,
  distinctnessInput: unknown, assignments: readonly unknown[], resolveEvidence: VoiceAcceptanceEvidenceResolver,
) {
  const expected = buildVoiceAcceptanceBundle(source, distinctnessInput, assignments, resolveEvidence)
  if (!exact(listenerInput, expected.listener) || !exact(operatorInput, expected.operatorKey)) {
    throw new Error('Voice acceptance bundle or operator key is stale or mismatched')
  }
  return expected
}
