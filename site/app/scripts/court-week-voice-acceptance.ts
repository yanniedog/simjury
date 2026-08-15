import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
import { voiceReviewDigest } from './court-week-voice-distinctness'
import { validateVoiceAcceptanceBundle, type VoiceAcceptanceEvidenceResolver,
  type VoiceAcceptanceSource } from './court-week-voice-acceptance-bundle'

export const VOICE_ACCEPTANCE_DECISIONS_SCHEMA = 'simjury.court-week-voice-acceptance-decisions/v1' as const
export const VOICE_ACCEPTANCE_APPROVAL_SCHEMA = 'simjury.court-week-voice-acceptance-approval/v1' as const
export const VOICE_ACCEPTANCE_DEVICES = ['reference-headphones', 'laptop-speakers', 'representative-phone'] as const
export const VOICE_DEFECT_KINDS = ['attribution', 'pronunciation', 'accent', 'intelligibility', 'misleading-emotion'] as const
const listenerIds = Array.from({ length: 5 }, (_, index) => `listener-${String(index + 1).padStart(2, '0')}`)
const identityIds: string[] = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }) => id)
const exact = (left: unknown, right: unknown): boolean => voiceReviewDigest(left) === voiceReviewDigest(right)

type Rating = { roleId: string; clipId: string; naturalness: number | null; australianAuthenticity: number | null
  accentAssessment: 'australian' | 'not-australian' | null }
export type ListenerDecision = {
  listenerId: string; blindingConfirmed: boolean | null; nativeAustralianEnglishSelfAttested: boolean | null
  devices: string[]; clipRatings: Rating[]
  preferences: { pairId: string; preferredClipId: string | 'tie' | null }[]
  recognitionAnswers: { trialId: string; selectedChoiceId: string | null }[]
  distinctnessDecisions: { pairId: string; distinguishable: boolean | null }[]
  defectReviewComplete: boolean
  defects: { clipId: string; kind: string; resolved: boolean; note: string }[]; reviewReference: string
}
export interface VoiceAcceptanceDecisions {
  schema: typeof VOICE_ACCEPTANCE_DECISIONS_SCHEMA; bundleDigest: string; listeners: ListenerDecision[]
}

type BundleInputs = Parameters<typeof validateVoiceAcceptanceBundle>
export function buildVoiceAcceptanceDecisionTemplate(...inputs: BundleInputs): VoiceAcceptanceDecisions {
  const { listener } = validateVoiceAcceptanceBundle(...inputs)
  const clipRatings = listener.comparisons.flatMap(({ roleId, clips }) => clips.map(({ clipId }) => ({
    roleId, clipId, naturalness: null, australianAuthenticity: null, accentAssessment: null,
  })))
  return { schema: VOICE_ACCEPTANCE_DECISIONS_SCHEMA, bundleDigest: listener.bundleDigest,
    listeners: listenerIds.map((listenerId) => ({ listenerId, blindingConfirmed: null,
      nativeAustralianEnglishSelfAttested: null, devices: [], clipRatings: structuredClone(clipRatings),
      preferences: listener.comparisons.map(({ pairId }) => ({ pairId, preferredClipId: null })),
      recognitionAnswers: listener.recognitionTrials.map(({ trialId }) => ({ trialId, selectedChoiceId: null })),
      distinctnessDecisions: listener.distinctnessComparisons.map(({ pairId }) => ({ pairId, distinguishable: null })),
      defectReviewComplete: false, defects: [], reviewReference: '',
    })) }
}

const inRange = (value: number | null): value is number => typeof value === 'number' && value >= 1 && value <= 5
export function approveVoiceAcceptance(
  listenerInput: unknown, operatorInput: unknown, source: VoiceAcceptanceSource,
  distinctnessInput: unknown, assignments: readonly unknown[], decisionInput: unknown,
  resolveEvidence: VoiceAcceptanceEvidenceResolver,
) {
  const { listener, operatorKey } = validateVoiceAcceptanceBundle(
    listenerInput, operatorInput, source, distinctnessInput, assignments, resolveEvidence)
  const decisions = decisionInput as VoiceAcceptanceDecisions
  if (!decisions || decisions.schema !== VOICE_ACCEPTANCE_DECISIONS_SCHEMA
    || decisions.bundleDigest !== listener.bundleDigest
    || !exact(decisions.listeners?.map(({ listenerId }) => listenerId), listenerIds)) {
    throw new Error('Exactly five ordered listener records must target the blind bundle')
  }
  const expectedRatings = listener.comparisons.flatMap(({ roleId, clips }) =>
    clips.map(({ clipId }) => ({ roleId, clipId })))
  const comparisonByPair = new Map(listener.comparisons.map((comparison) => [comparison.pairId, comparison]))
  const candidateIdentityByClip = new Map(operatorKey.comparisons.map(({ identityId, candidateClipId }) => [candidateClipId, identityId]))
  const recognitionKey = new Map(operatorKey.recognitionTrials.map((trial) => [trial.trialId, trial]))
  const allClipIds = new Set(expectedRatings.map(({ clipId }) => clipId)); const devices = new Set<string>()
  const candidateRatings = new Map(identityIds.map((id) => [id, [] as Rating[]]))
  let nativeCount = 0; let preferredCandidate = 0; let preferenceCount = 0; let correctRecognition = 0; let recognitionCount = 0
  for (const record of decisions.listeners) {
    if (record.blindingConfirmed !== true || typeof record.nativeAustralianEnglishSelfAttested !== 'boolean'
      || !record.reviewReference?.trim()) throw new Error(`${record.listenerId}: blind review is incomplete`)
    if (record.nativeAustralianEnglishSelfAttested) nativeCount += 1
    if (!Array.isArray(record.devices) || record.devices.length === 0 || record.devices.some((device) => !VOICE_ACCEPTANCE_DEVICES.includes(
      device as typeof VOICE_ACCEPTANCE_DEVICES[number]))) throw new Error(`${record.listenerId}: device evidence is invalid`)
    record.devices.forEach((device) => devices.add(device))
    if (!exact(record.clipRatings?.map(({ roleId, clipId }) => ({ roleId, clipId })), expectedRatings)
      || record.clipRatings.some(({ naturalness, australianAuthenticity, accentAssessment }) =>
        !inRange(naturalness) || !inRange(australianAuthenticity)
        || !['australian', 'not-australian'].includes(accentAssessment ?? ''))) {
      throw new Error(`${record.listenerId}: every opaque clip requires completed one-to-five ratings`)
    }
    for (const rating of record.clipRatings) { const identityId = candidateIdentityByClip.get(rating.clipId)
      if (identityId) candidateRatings.get(identityId)!.push(rating) }
    if (!exact(record.preferences?.map(({ pairId }) => pairId), listener.comparisons.map(({ pairId }) => pairId))) {
      throw new Error(`${record.listenerId}: A/B preference coverage is incomplete`)
    }
    for (const preference of record.preferences) {
      const comparison = comparisonByPair.get(preference.pairId)!
      if (preference.preferredClipId !== 'tie'
        && !comparison.clips.some(({ clipId }) => clipId === preference.preferredClipId)) {
        throw new Error(`${record.listenerId}: A/B preference is invalid`)
      }
      preferenceCount += 1
      if (preference.preferredClipId === operatorKey.comparisons.find(({ pairId }) => pairId === preference.pairId)!.candidateClipId) {
        preferredCandidate += 1
      }
    }
    if (!exact(record.recognitionAnswers?.map(({ trialId }) => trialId), listener.recognitionTrials.map(({ trialId }) => trialId))) {
      throw new Error(`${record.listenerId}: recognition coverage is incomplete`)
    }
    for (const answer of record.recognitionAnswers) {
      const trial = listener.recognitionTrials.find(({ trialId }) => trialId === answer.trialId)!
      if (!trial.options.some(({ choiceId }) => choiceId === answer.selectedChoiceId)) {
        throw new Error(`${record.listenerId}: recognition answer is invalid`)
      }
      recognitionCount += 1
      if (recognitionKey.get(answer.trialId)!.correctChoiceId === answer.selectedChoiceId) correctRecognition += 1
    }
    if (!exact(record.distinctnessDecisions?.map(({ pairId }) => pairId), listener.distinctnessComparisons.map(({ pairId }) => pairId))
      || record.distinctnessDecisions.some(({ distinguishable }) => distinguishable !== true)) {
      throw new Error(`${record.listenerId}: a closest or adjacent-role pair is not distinguishable`)
    }
    if (record.defectReviewComplete !== true || record.defects.some(({ clipId: id, kind, resolved, note }) =>
      !allClipIds.has(id) || !VOICE_DEFECT_KINDS.includes(kind as typeof VOICE_DEFECT_KINDS[number])
      || !resolved || !note.trim())) throw new Error(`${record.listenerId}: voice defects remain unresolved or unreviewed`)
  }
  if (nativeCount < 3) throw new Error('At least three listeners must self-attest as native Australian English listeners')
  if (!VOICE_ACCEPTANCE_DEVICES.every((device) => devices.has(device))) {
    throw new Error('Reference headphones, laptop speakers and a representative phone must all be covered')
  }
  let rawNaturalnessTotal = 0; let rawNaturalnessCount = 0
  const identityResults = identityIds.map((identityId) => {
    const ratings = candidateRatings.get(identityId)!
    const naturalness = ratings.reduce((sum, rating) => sum + rating.naturalness!, 0) / ratings.length
    const authenticity = ratings.reduce((sum, rating) => sum + rating.australianAuthenticity!, 0) / ratings.length
    const notAustralian = ratings.filter(({ accentAssessment }) => accentAssessment === 'not-australian').length
    if (ratings.length !== 5 || naturalness < 3.7) throw new Error(`${identityId}: naturalness is below 3.7`)
    if (authenticity < 4 || notAustralian >= 3) throw new Error(`${identityId}: Australian authenticity has not passed`)
    rawNaturalnessTotal += ratings.reduce((sum, rating) => sum + rating.naturalness!, 0); rawNaturalnessCount += ratings.length
    return { identityId, meanNaturalness: Number(naturalness.toFixed(4)),
      meanAustralianAuthenticity: Number(authenticity.toFixed(4)), notAustralianAssessments: notAustralian }
  })
  const meanNaturalness = rawNaturalnessTotal / rawNaturalnessCount
  const candidatePreferenceRate = preferredCandidate / preferenceCount; const recognitionRate = correctRecognition / recognitionCount
  if (meanNaturalness < 4) throw new Error('Mean naturalness must be at least 4.0')
  if (candidatePreferenceRate < 0.7) throw new Error('Candidate preference over volume-matched Kokoro is below 70%')
  if (recognitionRate < 0.9) throw new Error('Recurring-role four-way recognition is below 90%')
  const payload = { schema: VOICE_ACCEPTANCE_APPROVAL_SCHEMA, bundleDigest: listener.bundleDigest,
    operatorKeyDigest: operatorKey.operatorKeyDigest, sourceDigests: listener.sourceDigests,
    distinctnessApprovalDigest: listener.distinctnessApprovalDigest, castingContractDigest: listener.castingContractDigest,
    assignmentDigest: listener.assignmentDigest, decisionDigest: voiceReviewDigest(decisions), listenerCount: 5 as const,
    nativeAustralianListenerCount: nativeCount, deviceCoverage: [...VOICE_ACCEPTANCE_DEVICES],
    meanNaturalness: Number(meanNaturalness.toFixed(4)), identityResults,
    candidatePreferenceRate: Number(candidatePreferenceRate.toFixed(4)), recognitionRate: Number(recognitionRate.toFixed(4)),
    distinctnessDecisionCount: listener.distinctnessComparisons.length * 5, unresolvedDefectCount: 0 as const, allowed: true as const }
  return { ...payload, approvalDigest: voiceReviewDigest(payload) }
}

export function validateVoiceAcceptanceApproval(
  value: unknown, listenerInput: unknown, operatorInput: unknown, source: VoiceAcceptanceSource,
  distinctnessInput: unknown, assignments: readonly unknown[], decisionInput: unknown,
  resolveEvidence: VoiceAcceptanceEvidenceResolver,
) {
  const expected = approveVoiceAcceptance(listenerInput, operatorInput, source, distinctnessInput,
    assignments, decisionInput, resolveEvidence)
  if (!exact(value, expected)) {
    throw new Error('Five-listener voice acceptance approval is missing, stale or below threshold')
  }
  return expected
}
