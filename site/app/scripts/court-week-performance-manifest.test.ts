import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { COURT_WEEK_VOICES } from './court-week-audio-jobs'
import { buildCourtWeekPerformanceManifest, calculatePerformanceDigest, courtWeekPerformanceSourceDigest, refreshPerformanceDigest, validateCourtWeekPerformanceManifest } from './court-week-performance-manifest'
import { GOOGLE_CHIRP3_SOURCE } from './court-week-chirp-source'
const payloadOf = (manifest: ReturnType<typeof buildCourtWeekPerformanceManifest>) =>
  Object.fromEntries(Object.entries(manifest).filter(([key]) => !['performanceDigest', 'governanceDigest'].includes(key))) as
  Parameters<typeof calculatePerformanceDigest>[0]
describe('Court Week governed performance manifest', () => {
  it('binds exactly 28 identities to the sole Chirp stock-voice authority', () => {
    const first = buildCourtWeekPerformanceManifest()
    const second = buildCourtWeekPerformanceManifest()
    expect(validateCourtWeekPerformanceManifest(first)).toEqual(first)
    expect(second).toEqual(first)
    expect(first.identities).toHaveLength(28)
    const governedLabels = first.identities.flatMap(({ speakerLabels }) => speakerLabels)
    expect(new Set(governedLabels).size).toBe(governedLabels.length)
    expect(Object.keys(COURT_WEEK_VOICES).every((label) => governedLabels.includes(label))).toBe(true)
    expect(first.identities.find(({ id }) => id === 'clerk')?.speakerLabels)
      .toEqual(['Judge’s Associate', 'Clerk'])
    expect(first.identities.find(({ id }) => id === 'court-officer')?.speakerLabels)
      .toEqual(['Court Attendant', 'Court officer'])
    expect(first.identities.every(({ assignment }) => assignment === null)).toBe(true)
    expect(first.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.performanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.governanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(first.performanceDigest).not.toBe(first.sourceDigest)
    expect(first.computePolicy).toMatchObject({
      maxIncrementalSpendAud: 50, recurringSpendAud: 0, managedBatchApisAllowed: true,
      runtimeInferenceAllowed: false, cloudflareRuntimeAllowed: false,
      maximumProviderCharacters: 1_000_000, stockVoicesOnly: true,
      referenceAudioAllowed: false, resumableUnit: 'utterance',
    })
    expect(first.computePolicy).not.toHaveProperty('referenceConsentRequired')
    expect(first.schema).toBe('simjury.court-week-performance/v2')
    expect(first.stage).toBe('casting')
    expect(first.providers).toEqual([expect.objectContaining({
      id: 'google-chirp3-hd-en-au', delivery: 'managed-batch-api',
      voiceInventory: expect.objectContaining({ locale: 'en-AU', count: 30, status: 'verified',
        inventorySha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) }),
    })])
    expect(JSON.stringify(first.providers)).not.toMatch(/chatterbox|melo|openvoice|cloudflare|kokoro/iu)
    expect(JSON.stringify(first)).not.toMatch(/referencePath|consentPath|donorName/iu)
    const contract = readFileSync(new URL('../../../docs/COURT-WEEK-OFFLINE-VOICE-BAKEOFF.md', import.meta.url), 'utf8')
    expect(contract).toContain('Google Chirp 3 HD `en-AU` is the selected sole provider')
    expect(contract).toMatch(/Kokoro release\s+remains immutable as a rollback and A\/B comparator/u)
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
  it('rejects every provider and voice-source path outside Chirp stock voices', () => {
    const priorSchema = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as { schema: string }
    priorSchema.schema = 'simjury.court-week-performance/v1'
    expect(() => validateCourtWeekPerformanceManifest(priorSchema)).toThrow()
    const alternative = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as {
      providers: Array<Record<string, unknown>>
    }
    alternative.providers[0]!.id = 'chatterbox-v3'
    expect(() => validateCourtWeekPerformanceManifest(alternative)).toThrow()
    const second = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as { providers: unknown[] }
    second.providers.push(structuredClone(second.providers[0]))
    expect(() => validateCourtWeekPerformanceManifest(second)).toThrow()

    const voiceId = GOOGLE_CHIRP3_SOURCE.inventory.voices[0]!.voiceId
    const referenced = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as {
      identities: Array<{ assignment: Record<string, unknown> | null }>
    }
    referenced.identities[0]!.assignment = {
      source: 'consented-reference', providerId: 'google-chirp3-hd-en-au', voiceProfileId: voiceId,
      consentReceiptSha256: `sha256:${'a'.repeat(64)}`, referenceAudioSha256: `sha256:${'b'.repeat(64)}`,
    }
    expect(() => validateCourtWeekPerformanceManifest(referenced)).toThrow()
    const nonChirp = structuredClone(buildCourtWeekPerformanceManifest()) as unknown as {
      identities: Array<{ assignment: Record<string, unknown> | null }>
    }
    nonChirp.identities[0]!.assignment = {
      source: 'provider-stock', providerId: 'chatterbox-v3', voiceProfileId: voiceId,
    }
    expect(() => validateCourtWeekPerformanceManifest(nonChirp)).toThrow()

    const assigned = structuredClone(buildCourtWeekPerformanceManifest())
    assigned.identities[0]!.assignment = {
      source: 'provider-stock', providerId: 'google-chirp3-hd-en-au', voiceProfileId: voiceId,
    }
    expect(validateCourtWeekPerformanceManifest(refreshPerformanceDigest(assigned)).identities[0]!.assignment)
      .toMatchObject({ providerId: 'google-chirp3-hd-en-au', source: 'provider-stock', voiceProfileId: voiceId })
    assigned.identities[0]!.assignment.voiceProfileId = 'en-AU-Chirp3-HD-Imaginary'
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(assigned))).toThrow(/unknown Chirp 3 HD/iu)
  })

  it('fails closed on stale digests and incomplete approval', () => {
    const stale = structuredClone(buildCourtWeekPerformanceManifest())
    stale.providers[0].configuration += ' stale'
    expect(() => validateCourtWeekPerformanceManifest(stale)).toThrow('Performance digest')
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(stale))).toThrow('canonical Chirp authority')
    const missingProjection = structuredClone(buildCourtWeekPerformanceManifest())
    missingProjection.pronunciationProjections.pop()
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(missingProjection))).toThrow('Required pronunciation projections')
    const falseContract = structuredClone(buildCourtWeekPerformanceManifest())
    falseContract.sourceContract = 'explicit-reviewed'
    expect(() => validateCourtWeekPerformanceManifest(refreshPerformanceDigest(falseContract))).toThrow('misstates its source contract')
    expect(() => validateCourtWeekPerformanceManifest(buildCourtWeekPerformanceManifest(), true)).toThrow('reviewed voice assignment')
  })
})
