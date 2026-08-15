import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildChirpAuditionPlan, CHIRP_AUDITION_SCHEMA } from './court-week-chirp-audition'
import { buildCourtWeekChirpPlan, type ChirpRegistry, writeCourtWeekChirpPlan } from './court-week-chirp-plan'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
import {
  approveVoiceDistinctness, buildVoiceDistinctnessBundle, validateVoiceDistinctnessApproval,
  VOICE_DISTINCTNESS_DECISIONS_SCHEMA,
  writeVoiceDistinctnessListenerBundle,
} from './court-week-voice-distinctness'

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true })
})

function auditionDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'simjury-distinctness-'))
  temporaryDirectories.push(directory)
  for (const job of buildChirpAuditionPlan().jobs) {
    const audio = Buffer.from(`test-only:${job.voiceId}`)
    const audioSha256 = `sha256:${createHash('sha256').update(audio).digest('hex')}`
    writeFileSync(join(directory, `${job.jobId}.mp3`), audio)
    writeFileSync(join(directory, `${job.jobId}.json`), JSON.stringify({
      schema: CHIRP_AUDITION_SCHEMA, jobId: job.jobId, voiceId: job.voiceId,
      requestSha256: job.requestSha256, audioSha256,
      providerResponse: { bodySha256: `sha256:${'b'.repeat(64)}` },
    }))
  }
  return directory
}

const comparisonId = (left: string, right: string): string => [left, right].sort().join('::')

function completeDecisions(bundle: ReturnType<typeof buildVoiceDistinctnessBundle>) {
  const selectedBlindIds = bundle.listener.clips.slice(0, 28).map(({ blindId }) => blindId).sort()
  const assignments = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({
    identityId: id, blindId: selectedBlindIds[index]!,
  }))
  const selectedClips = bundle.listener.clips.filter(({ blindId }) => selectedBlindIds.includes(blindId))
  const sameGenderRankings = selectedBlindIds.map((blindId) => {
    const cohort = selectedClips.filter((clip) => clip.presentedGender
      === selectedClips.find((candidate) => candidate.blindId === blindId)!.presentedGender)
    const index = cohort.findIndex((clip) => clip.blindId === blindId)
    return { blindId, rankedBlindIds: [...cohort.slice(index + 1), ...cohort.slice(0, index)].map(({ blindId: id }) => id) }
  })
  const required = new Set(sameGenderRankings.map(({ blindId, rankedBlindIds }) =>
    comparisonId(blindId, rankedBlindIds[0]!)))
  const blindByIdentity = new Map<string, string>(assignments.map(({ identityId, blindId }) => [identityId, blindId]))
  for (const pair of bundle.listener.adjacentRolePairs) required.add(comparisonId(
    blindByIdentity.get(pair.leftIdentityId)!, blindByIdentity.get(pair.rightIdentityId)!,
  ))
  return {
    schema: VOICE_DISTINCTNESS_DECISIONS_SCHEMA, listenerDigest: bundle.listener.listenerDigest,
    selectedBlindIds, assignments, sameGenderRankings,
    pairDecisions: [...required].sort().map((id) => {
      const [leftBlindId, rightBlindId] = id.split('::')
      return { leftBlindId: leftBlindId!, rightBlindId: rightBlindId!, distinguishable: true, reviewReference: `blind-panel:${id}` }
    }),
  }
}

function registryFor(bundle: ReturnType<typeof buildVoiceDistinctnessBundle>, decisions: ReturnType<typeof completeDecisions>): ChirpRegistry {
  const voiceByBlind = new Map(bundle.operatorKey.voices.map(({ blindId, voiceId }) => [blindId, voiceId]))
  const assignments = decisions.assignments.map(({ identityId, blindId }) => ({ identityId, voiceId: voiceByBlind.get(blindId)! }))
  const evidence = { capturedAt: '2026-08-15T00:00:00.000Z', sourceSha256: `sha256:${'a'.repeat(64)}` }
  return {
    schema: 'simjury.google-chirp3-hd-registry/v1', providerId: 'google-chirp3-hd-en-au',
    model: 'Chirp 3: HD voices', locale: 'en-AU', voiceSource: 'provider-stock',
    inventory: { ...evidence, sourceUrl: 'https://cloud.google.com/voices', voiceIds: assignments.map(({ voiceId }) => voiceId).sort() },
    pricing: { ...evidence, sourceUrl: 'https://cloud.google.com/pricing', billingCharacterUnit: 'unicode-code-points', usdMicrosPerMillionCharacters: 30_000_000 },
    audConversion: { ...evidence, sourceUrl: 'https://example.invalid/aud', audMicrosPerUsd: 1_500_000 },
    assignments,
  }
}

describe('private Chirp voice distinctness review', () => {
  it('inventories all 30 hash-bound clips without unblinding the listener contract', () => {
    const directory = auditionDirectory()
    const first = buildVoiceDistinctnessBundle(directory)
    expect(buildVoiceDistinctnessBundle(directory)).toEqual(first)
    expect(first.listener.clips).toHaveLength(30)
    expect(new Set(first.listener.clips.map(({ audioSha256 }) => audioSha256)).size).toBe(30)
    expect(first.listener.clips.filter(({ presentedGender }) => presentedGender === 'female')).toHaveLength(14)
    expect(first.listener.clips.filter(({ presentedGender }) => presentedGender === 'male')).toHaveLength(16)
    expect(first.listener.identities).toHaveLength(28)
    expect(first.listener.adjacentRolePairs.length).toBeGreaterThan(20)
    expect(JSON.stringify(first.listener)).not.toContain('en-AU-Chirp3-HD-')
    expect(JSON.stringify(first.listener)).not.toContain(directory)
    expect(new Set(first.operatorKey.voices.map(({ voiceId }) => voiceId)).size).toBe(30)

    const listenerOutput = mkdtempSync(join(tmpdir(), 'simjury-blind-listener-'))
    temporaryDirectories.push(listenerOutput)
    expect(writeVoiceDistinctnessListenerBundle(directory, listenerOutput)).toMatchObject({ clipCount: 30 })
    expect(readdirSync(listenerOutput)).toHaveLength(32)
    const listenerJson = readFileSync(join(listenerOutput, 'listener.json'), 'utf8')
    expect(listenerJson).not.toContain('en-AU-Chirp3-HD-')
    expect(listenerJson).not.toContain(first.operatorKey.voices[0]!.sourceAudioFile)
    expect(() => writeVoiceDistinctnessListenerBundle(directory, listenerOutput)).toThrow(/must be empty/i)
  })

  it('rejects stale audio and unexpected private-directory contents', () => {
    const directory = auditionDirectory()
    const job = buildChirpAuditionPlan().jobs[0]!
    writeFileSync(join(directory, `${job.jobId}.mp3`), 'tampered')
    expect(() => buildVoiceDistinctnessBundle(directory)).toThrow(/stale/i)
    const clean = auditionDirectory()
    writeFileSync(join(clean, 'unexpected.txt'), 'not audio')
    expect(() => buildVoiceDistinctnessBundle(clean)).toThrow(/exactly the expected/i)
  })

  it('requires 28 unique castings and every closest/adjacent pair to pass before unblocking the plan', () => {
    const audition = auditionDirectory()
    const bundle = buildVoiceDistinctnessBundle(audition)
    const decisions = completeDecisions(bundle)
    const registry = registryFor(bundle, decisions)
    const approval = approveVoiceDistinctness(bundle, decisions)
    expect(validateVoiceDistinctnessApproval(approval, registry.assignments)).toEqual(approval)
    expect(approval.requiredPairCount).toBeGreaterThan(28)
    expect(buildCourtWeekChirpPlan(registry).generationGate.blockers).toContain('perceptual-distinctness-review')
    expect(buildCourtWeekChirpPlan(registry, undefined, { distinctnessApproval: approval }).generationGate.blockers)
      .not.toContain('perceptual-distinctness-review')
    const output = join(audition, 'plan.json'); const approvalPath = join(audition, 'approval.json')
    const registryPath = join(audition, 'registry.json')
    writeFileSync(approvalPath, JSON.stringify(approval)); writeFileSync(registryPath, JSON.stringify(registry))
    writeCourtWeekChirpPlan(registryPath, output, approvalPath)
    expect(JSON.parse(readFileSync(output, 'utf8')).generationGate.blockers).not.toContain('perceptual-distinctness-review')

    const duplicated = structuredClone(decisions)
    duplicated.assignments[1]!.blindId = duplicated.assignments[0]!.blindId
    expect(() => approveVoiceDistinctness(bundle, duplicated)).toThrow(/distinct selected voice/i)
    const missing = structuredClone(decisions)
    missing.pairDecisions.pop()
    expect(() => approveVoiceDistinctness(bundle, missing)).toThrow(/exactly cover/i)
    const failed = structuredClone(decisions)
    failed.pairDecisions[0]!.distinguishable = false
    expect(() => approveVoiceDistinctness(bundle, failed)).toThrow(/has not passed/i)
    const incomplete = structuredClone(decisions); incomplete.sameGenderRankings[0]!.rankedBlindIds.pop()
    expect(() => approveVoiceDistinctness(bundle, incomplete)).toThrow(/ranking is incomplete/i)
    const stale = { ...approval, castingContractDigest: `sha256:${'0'.repeat(64)}` }
    expect(() => validateVoiceDistinctnessApproval(stale, registry.assignments)).toThrow(/stale/i)
    expect(() => validateVoiceDistinctnessApproval(approval, [...registry.assignments].reverse())).toThrow(/registry/i)
  })
})
