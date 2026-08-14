import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { COURT_WEEK_VOICES } from './court-week-audio-jobs'
import { buildCourtWeekPerformanceManifest, calculatePerformanceDigest, courtWeekPerformanceSourceDigest, refreshPerformanceDigest, validateCourtWeekPerformanceManifest } from './court-week-performance-manifest'
const payloadOf = (manifest: ReturnType<typeof buildCourtWeekPerformanceManifest>) =>
  Object.fromEntries(Object.entries(manifest).filter(([key]) => !['performanceDigest', 'governanceDigest'].includes(key))) as
  Parameters<typeof calculatePerformanceDigest>[0]
describe('Court Week governed performance manifest', () => {
  it('binds exactly 28 provider-neutral identities to the current authored speakers', () => {
    const first = buildCourtWeekPerformanceManifest()
    const second = buildCourtWeekPerformanceManifest()
    expect(validateCourtWeekPerformanceManifest(first)).toEqual(first)
    expect(second).toEqual(first)
    expect(first.identities).toHaveLength(28)
    expect(first.identities.flatMap(({ speakerLabels }) => speakerLabels).sort())
      .toEqual(Object.keys(COURT_WEEK_VOICES).sort())
    expect(first.identities.every(({ assignment }) => assignment === null)).toBe(true)
    expect(first.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.performanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.governanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.performanceDigest).not.toBe(first.sourceDigest)
    expect(first.computePolicy).toMatchObject({
      maxIncrementalSpendAud: 50, recurringSpendAud: 0, managedBatchApisAllowed: true,
      runtimeInferenceAllowed: false, cloudflareRuntimeAllowed: false,
      maximumProviderCharacters: 1_000_000, resumableUnit: 'utterance',
    })
    expect(first.providers).toContainEqual(expect.objectContaining({
      id: 'google-chirp3-hd-en-au', delivery: 'managed-batch-api',
      voiceInventory: expect.objectContaining({ locale: 'en-AU', count: 30, status: 'verified',
        inventorySha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) }),
    }))
    expect(JSON.stringify(first)).not.toMatch(/referencePath|consentPath|donorName/iu)
  })
  it('separates exact source identity from provider and casting identity', () => {
    const manifest = buildCourtWeekPerformanceManifest()
    const changed = structuredClone(payloadOf(manifest))
    changed.providers[0].configuration += ' candidate adjustment'
    expect(calculatePerformanceDigest(changed)).not.toBe(manifest.performanceDigest)
    expect(changed.sourceDigest).toBe(manifest.sourceDigest)
    const approved = structuredClone(manifest)
    approved.stage = 'approved'
    approved.pronunciationProjections.forEach((projection) => { projection.status = 'approved' })
    const refreshed = refreshPerformanceDigest(approved)
    expect(refreshed.performanceDigest).toBe(manifest.performanceDigest)
    expect(refreshed.governanceDigest).not.toBe(manifest.governanceDigest)
    const changedCourtWeek = structuredClone(elevenMinutesCourtWeek)
    changedCourtWeek.manifest.sessions[0].scenes[0].cues[0].text += ' Changed.'
    expect(courtWeekPerformanceSourceDigest(changedCourtWeek)).not.toBe(manifest.sourceDigest)
    const cue = changedCourtWeek.manifest.sessions[0].scenes[0].cues[0] as unknown as { turns?: unknown }
    cue.turns = [{ id: 'explicit-turn', actorId: 'narrator', displayLabel: 'Narrator', text: 'Explicit reviewed words.', speechMode: 'narration', legalAction: 'none' }]
    const explicitDigest = courtWeekPerformanceSourceDigest(changedCourtWeek)
    cue.turns = [{ id: 'explicit-turn', actorId: 'narrator', displayLabel: 'Narrator', text: 'Changed reviewed words.', speechMode: 'narration', legalAction: 'none' }]
    expect(courtWeekPerformanceSourceDigest(changedCourtWeek)).not.toBe(explicitDigest)
  })
  it('fails closed on stale digests, raw-reference fields and incomplete approval', () => {
    const stale = structuredClone(buildCourtWeekPerformanceManifest())
    stale.providers[0].configuration += ' stale'
    expect(() => validateCourtWeekPerformanceManifest(stale)).toThrow('Performance digest')
    expect(validateCourtWeekPerformanceManifest(refreshPerformanceDigest(stale)).providers[0].configuration).toContain('stale')
    const rawReference = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as { identities: Array<{ assignment: Record<string, unknown> | null }> }
    rawReference.identities[0].assignment = {
      source: 'consented-reference', providerId: 'chatterbox-v3', voiceProfileId: 'ari-tem-v1',
      consentReceiptSha256: `sha256:${'a'.repeat(64)}`,
      referenceAudioSha256: `sha256:${'b'.repeat(64)}`,
      referencePath: 'private/ari.wav',
    }
    expect(() => validateCourtWeekPerformanceManifest(rawReference)).toThrow(/referencePath/u)
    const unknownProvider = structuredClone(buildCourtWeekPerformanceManifest())
    unknownProvider.identities[0].assignment = {
      source: 'provider-stock', providerId: 'unknown', voiceProfileId: 'ari-tem-v1',
    }
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(unknownProvider))).toThrow('unknown provider')
    const missingProjection = structuredClone(buildCourtWeekPerformanceManifest())
    missingProjection.pronunciationProjections.pop()
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(missingProjection))).toThrow('Required pronunciation projections')
    const falseContract = structuredClone(buildCourtWeekPerformanceManifest())
    falseContract.sourceContract = 'explicit-reviewed'
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(falseContract))).toThrow('misstates its source contract')
    expect(() => validateCourtWeekPerformanceManifest(buildCourtWeekPerformanceManifest(), true)).toThrow('reviewed voice assignment')
  })
})
