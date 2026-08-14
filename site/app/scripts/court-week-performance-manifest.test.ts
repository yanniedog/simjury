import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { COURT_WEEK_VOICES } from './court-week-audio-jobs'
import {
  buildCourtWeekPerformanceManifest,
  calculatePerformanceDigest,
  courtWeekPerformanceSourceDigest,
  refreshPerformanceDigest,
  validateCourtWeekPerformanceManifest,
} from './court-week-performance-manifest'

const payloadOf = (manifest: ReturnType<typeof buildCourtWeekPerformanceManifest>) =>
  Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'performanceDigest')) as
  Parameters<typeof calculatePerformanceDigest>[0]

describe('Court Week offline performance manifest', () => {
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
    expect(first.performanceDigest).not.toBe(first.sourceDigest)
    expect(first.computePolicy).toMatchObject({ maxIncrementalSpendAud: 20, recurringSpendAud: 0, billableEndpointsAllowed: false, resumableUnit: 'utterance' })
    expect(JSON.stringify(first)).not.toMatch(/referencePath|consentPath|donorName/iu)
  })

  it('separates exact source identity from provider and casting identity', () => {
    const manifest = buildCourtWeekPerformanceManifest()
    const changed = structuredClone(payloadOf(manifest))
    changed.providers[0].configuration += ' candidate adjustment'

    expect(calculatePerformanceDigest(changed)).not.toBe(manifest.performanceDigest)
    expect(changed.sourceDigest).toBe(manifest.sourceDigest)

    const changedCourtWeek = structuredClone(elevenMinutesCourtWeek)
    changedCourtWeek.manifest.sessions[0].scenes[0].cues[0].text += ' Changed.'
    expect(courtWeekPerformanceSourceDigest(changedCourtWeek)).not.toBe(manifest.sourceDigest)
  })

  it('fails closed on stale digests, raw-reference fields and incomplete approval', () => {
    const stale = structuredClone(buildCourtWeekPerformanceManifest())
    stale.providers[0].configuration += ' stale'
    expect(() => validateCourtWeekPerformanceManifest(stale)).toThrow('Performance digest')
    expect(validateCourtWeekPerformanceManifest(refreshPerformanceDigest(stale)).providers[0].configuration)
      .toContain('stale')

    const rawReference = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as { identities: Array<{ assignment: Record<string, unknown> | null }> }
    rawReference.identities[0].assignment = {
      providerId: 'chatterbox-v3', voiceProfileId: 'ari-tem-v1',
      consentReceiptSha256: `sha256:${'a'.repeat(64)}`,
      referenceAudioSha256: `sha256:${'b'.repeat(64)}`,
      referencePath: 'private/ari.wav',
    }
    expect(() => validateCourtWeekPerformanceManifest(rawReference)).toThrow()

    const unknownProvider = structuredClone(buildCourtWeekPerformanceManifest())
    unknownProvider.identities[0].assignment = {
      providerId: 'unknown', voiceProfileId: 'ari-tem-v1',
      consentReceiptSha256: `sha256:${'a'.repeat(64)}`,
      referenceAudioSha256: `sha256:${'b'.repeat(64)}`,
    }
    unknownProvider.performanceDigest = refreshPerformanceDigest(unknownProvider).performanceDigest
    expect(() => validateCourtWeekPerformanceManifest(unknownProvider)).toThrow('unknown provider')

    expect(() => validateCourtWeekPerformanceManifest(
      buildCourtWeekPerformanceManifest(), true,
    )).toThrow('consented reference assignment')
  })
})
