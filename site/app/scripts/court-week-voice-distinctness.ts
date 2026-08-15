import { createHash } from 'node:crypto'
import { constants, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCourtWeekSpeechReviewLedger } from '../src/courtweek/content/speechReviewLedger'
import { buildChirpAuditionPlan, assertAuditionOutputDirectory, CHIRP_AUDITION_SCHEMA } from './court-week-chirp-audition'
import { GOOGLE_CHIRP3_SOURCE } from './court-week-chirp-source'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'

export const VOICE_DISTINCTNESS_SCHEMA = 'simjury.court-week-voice-distinctness/v1' as const
export const VOICE_DISTINCTNESS_DECISIONS_SCHEMA = 'simjury.court-week-voice-distinctness-decisions/v1' as const
export const VOICE_DISTINCTNESS_APPROVAL_SCHEMA = 'simjury.court-week-voice-distinctness-approval/v1' as const
const sha256Pattern = /^sha256:[0-9a-f]{64}$/u

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}
const digest = (value: unknown): string => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
const audioDigest = (value: Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`
const pairId = (left: string, right: string): string => [left, right].sort().join('::')

function roleAdjacencyPairs(): { leftIdentityId: string; rightIdentityId: string }[] {
  const identityByLabel = new Map<string, string>(CANONICAL_PERFORMANCE_IDENTITIES.flatMap((identity) =>
    identity.speakerLabels.map((label) => [label, identity.id] as const)))
  const rows = buildCourtWeekSpeechReviewLedger().rows
  const pairs = new Map<string, { leftIdentityId: string; rightIdentityId: string }>()
  const addPath = (path: typeof rows): void => { for (let index = 1; index < path.length; index += 1) {
    const [prior, current] = [path[index - 1]!, path[index]!]
    const identities = [identityByLabel.get(prior.displayLabel), identityByLabel.get(current.displayLabel)]
    if (!identities[0] || !identities[1] || identities[0] === identities[1]) continue
    const [leftIdentityId, rightIdentityId] = identities.sort()
    pairs.set(pairId(leftIdentityId!, rightIdentityId!), { leftIdentityId: leftIdentityId!, rightIdentityId: rightIdentityId! })
  } }
  for (const day of [...new Set(rows.map(({ day }) => day))]) {
    const primary = rows.filter((row) => row.day === day && row.variant === null)
    addPath(primary)
    const variants = [...new Set(rows.filter((row) => row.day === day && row.variant).map(({ variant }) => variant!))]
    for (const variant of variants.filter((key) => !key.startsWith('analysis:'))) {
      const analysis = `analysis:${variant.split(':')[0]}`
      addPath([...primary.slice(-1), ...rows.filter((row) => row.day === day
        && (row.variant === variant || row.variant === analysis))])
    }
  }
  return [...pairs.values()].sort((left, right) =>
    pairId(left.leftIdentityId, left.rightIdentityId).localeCompare(pairId(right.leftIdentityId, right.rightIdentityId), 'en'))
}

const castingContract = () => ({
  identities: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id, castingBrief }) => ({ id, castingBrief })),
  adjacentRolePairs: roleAdjacencyPairs(),
  requirements: { selectedVoiceCount: 28 as const, uniqueVoicePerIdentity: true as const,
    completeSameGenderRankingForEverySelectedVoice: true as const, everyRequiredPairMustBeDistinguishable: true as const },
})

export type VoiceDistinctnessBundle = ReturnType<typeof buildVoiceDistinctnessBundle>

/** Reads only the private audition directory; the listener contract contains no voice ids or absolute paths. */
export function buildVoiceDistinctnessBundle(auditionInput: string) {
  const directory = assertAuditionOutputDirectory(auditionInput)
  const plan = buildChirpAuditionPlan()
  const expectedFiles = new Set(plan.jobs.flatMap(({ jobId }) => [`${jobId}.json`, `${jobId}.mp3`]))
  const actualFiles = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile())
    .map(({ name }) => name).sort()
  if (actualFiles.length !== 60 || actualFiles.some((file) => !expectedFiles.has(file))) {
    throw new Error('Audition inventory must contain exactly the expected 30 sidecars and 30 MP3 files')
  }
  const genderByVoice = new Map(GOOGLE_CHIRP3_SOURCE.inventory.voices
    .map(({ voiceId, presentedGender }) => [voiceId, presentedGender] as const))
  const artifacts = plan.jobs.map((job) => {
    const metadata = JSON.parse(readFileSync(join(directory, `${job.jobId}.json`), 'utf8')) as Record<string, unknown>
    const audioSha256 = audioDigest(readFileSync(join(directory, `${job.jobId}.mp3`)))
    const providerResponse = metadata.providerResponse as Record<string, unknown> | undefined
    if (metadata.schema !== CHIRP_AUDITION_SCHEMA || metadata.jobId !== job.jobId
      || metadata.voiceId !== job.voiceId || metadata.requestSha256 !== job.requestSha256
      || metadata.audioSha256 !== audioSha256 || !sha256Pattern.test(String(providerResponse?.bodySha256))) {
      throw new Error(`${job.voiceId}: audition sidecar or audio is stale`)
    }
    return { ...job, audioSha256, presentedGender: genderByVoice.get(job.voiceId)! }
  })
  const blinded = artifacts.map((artifact) => ({ artifact, order: digest([plan.planDigest, artifact.audioSha256]) }))
    .sort((left, right) => left.order.localeCompare(right.order, 'en'))
    .map(({ artifact }, index) => ({ ...artifact, blindId: `voice-${String(index + 1).padStart(2, '0')}` }))
  const listenerPayload = {
    schema: VOICE_DISTINCTNESS_SCHEMA, auditionPlanDigest: plan.planDigest,
    clips: blinded.map(({ blindId, audioSha256, presentedGender }) => ({
      blindId, presentedGender, audioFile: `${blindId}.mp3`, audioSha256,
    })),
    ...castingContract(),
  }
  const listener = { ...listenerPayload, listenerDigest: digest(listenerPayload) }
  return {
    listener,
    operatorKey: {
      schema: VOICE_DISTINCTNESS_SCHEMA,
      listenerDigest: listener.listenerDigest,
      voices: blinded.map(({ blindId, voiceId, jobId }) => ({ blindId, voiceId, sourceAudioFile: `${jobId}.mp3` })),
    },
    decisionTemplate: {
      schema: VOICE_DISTINCTNESS_DECISIONS_SCHEMA,
      listenerDigest: listener.listenerDigest,
      selectedBlindIds: [], assignments: [], sameGenderRankings: [], pairDecisions: [],
    },
  }
}

/** Copies only opaque MP3 aliases and blind JSON into a new private directory outside the repository. */
export function writeVoiceDistinctnessListenerBundle(auditionInput: string, listenerOutput: string) {
  const auditionDirectory = assertAuditionOutputDirectory(auditionInput)
  const outputDirectory = assertAuditionOutputDirectory(listenerOutput)
  if (readdirSync(outputDirectory).length) throw new Error('Listener output directory must be empty')
  const bundle = buildVoiceDistinctnessBundle(auditionDirectory)
  const sourceByBlind = new Map(bundle.operatorKey.voices.map(({ blindId, sourceAudioFile }) => [blindId, sourceAudioFile]))
  for (const clip of bundle.listener.clips) copyFileSync(
    join(auditionDirectory, sourceByBlind.get(clip.blindId)!), join(outputDirectory, clip.audioFile), constants.COPYFILE_EXCL,
  )
  writeFileSync(join(outputDirectory, 'listener.json'), `${JSON.stringify(bundle.listener, null, 2)}\n`, { flag: 'wx' })
  writeFileSync(join(outputDirectory, 'decisions.json'), `${JSON.stringify(bundle.decisionTemplate, null, 2)}\n`, { flag: 'wx' })
  return { listenerDigest: bundle.listener.listenerDigest, clipCount: bundle.listener.clips.length }
}

interface Decisions {
  schema: typeof VOICE_DISTINCTNESS_DECISIONS_SCHEMA
  listenerDigest: string
  selectedBlindIds: string[]
  assignments: { identityId: string; blindId: string }[]
  sameGenderRankings: { blindId: string; rankedBlindIds: string[] }[]
  pairDecisions: { leftBlindId: string; rightBlindId: string; distinguishable: boolean; reviewReference: string }[]
}

export function approveVoiceDistinctness(bundle: VoiceDistinctnessBundle, input: unknown) {
  const decisions = input as Decisions
  if (!decisions || decisions.schema !== VOICE_DISTINCTNESS_DECISIONS_SCHEMA
    || decisions.listenerDigest !== bundle.listener.listenerDigest) throw new Error('Voice decisions target a different listener bundle')
  const known = new Map(bundle.listener.clips.map((clip) => [clip.blindId, clip]))
  const selected = decisions.selectedBlindIds
  if (!Array.isArray(selected) || selected.length !== 28 || new Set(selected).size !== 28
    || selected.some((id) => !known.has(id)) || canonicalJson(selected) !== canonicalJson([...selected].sort())) {
    throw new Error('Voice decisions require 28 unique, sorted audition ids')
  }
  const expectedIdentities = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }) => id)
  if (!Array.isArray(decisions.assignments)
    || canonicalJson(decisions.assignments.map(({ identityId }) => identityId)) !== canonicalJson(expectedIdentities)
    || new Set(decisions.assignments.map(({ blindId }) => blindId)).size !== 28
    || canonicalJson([...decisions.assignments.map(({ blindId }) => blindId)].sort()) !== canonicalJson(selected)) {
    throw new Error('Every canonical identity requires one distinct selected voice')
  }
  if (!Array.isArray(decisions.sameGenderRankings)
    || canonicalJson(decisions.sameGenderRankings.map(({ blindId }) => blindId)) !== canonicalJson(selected)) {
    throw new Error('Every selected voice requires a complete same-gender ranking')
  }
  const requiredPairs = new Set<string>()
  for (const { blindId, rankedBlindIds } of decisions.sameGenderRankings) {
    const clip = known.get(blindId)
    const cohort = selected.filter((id) => id !== blindId && known.get(id)?.presentedGender === clip?.presentedGender).sort()
    if (!clip || !Array.isArray(rankedBlindIds) || canonicalJson([...rankedBlindIds].sort()) !== canonicalJson(cohort)) {
      throw new Error(`${blindId}: same-gender ranking is incomplete or invalid`)
    }
    requiredPairs.add(pairId(blindId, rankedBlindIds[0]!))
  }
  const blindByIdentity = new Map(decisions.assignments.map(({ identityId, blindId }) => [identityId, blindId]))
  for (const pair of bundle.listener.adjacentRolePairs) requiredPairs.add(pairId(
    blindByIdentity.get(pair.leftIdentityId)!, blindByIdentity.get(pair.rightIdentityId)!,
  ))
  const reviewedPairs = new Map((decisions.pairDecisions ?? []).map((decision) => [
    pairId(decision.leftBlindId, decision.rightBlindId), decision,
  ]))
  if (reviewedPairs.size !== decisions.pairDecisions?.length || reviewedPairs.size !== requiredPairs.size
    || [...reviewedPairs.keys()].some((id) => !requiredPairs.has(id))) throw new Error('Pair decisions must exactly cover closest and adjacent-role comparisons')
  for (const id of requiredPairs) {
    const decision = reviewedPairs.get(id)
    if (!decision?.distinguishable || !decision.reviewReference?.trim()) throw new Error(`${id}: distinctness review has not passed`)
  }
  const voiceByBlind = new Map(bundle.operatorKey.voices.map(({ blindId, voiceId }) => [blindId, voiceId]))
  const assignments = decisions.assignments.map(({ identityId, blindId }) => ({ identityId, voiceId: voiceByBlind.get(blindId)! }))
  const payload = {
    schema: VOICE_DISTINCTNESS_APPROVAL_SCHEMA, auditionPlanDigest: buildChirpAuditionPlan().planDigest,
    listenerDigest: bundle.listener.listenerDigest, castingContractDigest: digest(castingContract()),
    assignmentDigest: digest(assignments), decisionDigest: digest(decisions),
    requiredPairCount: requiredPairs.size, allowed: true as const,
  }
  return { ...payload, approvalDigest: digest(payload) }
}

export function validateVoiceDistinctnessApproval(value: unknown, assignments: readonly unknown[]) {
  const approval = value as ReturnType<typeof approveVoiceDistinctness>
  const { approvalDigest, ...payload } = approval ?? {}
  if (!approval || approval.schema !== VOICE_DISTINCTNESS_APPROVAL_SCHEMA || approval.allowed !== true
    || approval.auditionPlanDigest !== buildChirpAuditionPlan().planDigest
    || approval.castingContractDigest !== digest(castingContract())
    || !sha256Pattern.test(approval.listenerDigest) || !sha256Pattern.test(approval.decisionDigest)
    || approval.assignmentDigest !== digest(assignments)
    || approvalDigest !== digest(payload)) {
    throw new Error('Perceptual-distinctness approval is missing, stale or does not match the registry')
  }
  return approval
}

const argument = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const audition = argument(process.argv, '--audition') ?? ''
  const listenerOutput = argument(process.argv, '--listener-output')
  if (listenerOutput) {
    console.log(JSON.stringify(writeVoiceDistinctnessListenerBundle(audition, listenerOutput), null, 2))
  } else {
    const bundle = buildVoiceDistinctnessBundle(audition)
    const decisionsPath = argument(process.argv, '--decisions')
    const result = decisionsPath
      ? approveVoiceDistinctness(bundle, JSON.parse(readFileSync(resolve(decisionsPath), 'utf8')))
      : process.argv.includes('--operator-key') ? bundle.operatorKey : {
        listener: bundle.listener, decisionTemplate: bundle.decisionTemplate,
      }
    console.log(JSON.stringify(result, null, 2))
  }
}
