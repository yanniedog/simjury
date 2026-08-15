import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COURT_WEEK_SPEECH_CANDIDATES, buildCourtWeekSpeechReviewLedger } from '../src/courtweek/content/speechReviewLedger'
import {
  buildCourtWeekPerformanceManifest,
  CANONICAL_PERFORMANCE_IDENTITIES,
  refreshPerformanceDigest,
} from './court-week-performance-manifest'
import {
  buildCourtWeekPronounceabilityAudit,
  type PronounceabilityDisposition,
} from './court-week-pronounceability'
import { GOOGLE_CHIRP3_SOURCE } from './court-week-chirp-source'
import { COURT_WEEK_REVIEW_ROLES } from './court-week-review-signoffs'
import {
  buildCourtWeekChirpPlan,
  type ChirpRegistry,
  validateChirpRegistry,
  writeCourtWeekChirpPlan,
} from './court-week-chirp-plan'

const evidence = {
  capturedAt: '2026-08-15T00:00:00.000Z',
  sourceSha256: `sha256:${'a'.repeat(64)}`,
}

function fixtureRegistry(): ChirpRegistry {
  const voiceIds = GOOGLE_CHIRP3_SOURCE.inventory.voices.slice(0, 28)
    .map(({ voiceId }) => voiceId).sort()
  return {
    schema: 'simjury.google-chirp3-hd-registry/v1',
    providerId: 'google-chirp3-hd-en-au', model: 'Chirp 3: HD voices', locale: 'en-AU',
    voiceSource: 'provider-stock',
    inventory: {
      ...evidence, sourceUrl: 'https://cloud.google.com/text-to-speech/docs/voices', voiceIds,
    },
    pricing: {
      ...evidence, sourceSha256: `sha256:${'b'.repeat(64)}`,
      sourceUrl: 'https://cloud.google.com/text-to-speech/pricing',
      billingCharacterUnit: 'unicode-code-points', usdMicrosPerMillionCharacters: 30_000_000,
    },
    audConversion: {
      ...evidence, sourceSha256: `sha256:${'c'.repeat(64)}`,
      sourceUrl: 'https://example.invalid/test-only-aud-freeze', audMicrosPerUsd: 1_500_000,
    },
    assignments: CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }, index) => ({
      identityId: id, voiceId: voiceIds[index]!,
    })),
  }
}

function fixturePerformanceManifest(registry: ChirpRegistry) {
  const manifest = buildCourtWeekPerformanceManifest()
  manifest.identities.forEach((identity, index) => {
    identity.assignment = {
      source: 'provider-stock', providerId: registry.providerId,
      voiceProfileId: registry.assignments[index]!.voiceId,
    }
  })
  return refreshPerformanceDigest(manifest)
}

type PlanReview = Parameters<typeof buildCourtWeekChirpPlan>[2]
const planReview = (registry: ChirpRegistry, review: Partial<PlanReview> = {}): PlanReview => ({
  performanceManifest: fixturePerformanceManifest(registry), ...review,
})

describe('offline Court Week Chirp 3 HD plan', () => {
  it('maps every explicit candidate and runtime variant deterministically to 28 stock voices', () => {
    const before = JSON.stringify(COURT_WEEK_SPEECH_CANDIDATES)
    const registry = fixtureRegistry()
    const first = buildCourtWeekChirpPlan(registry, undefined, planReview(registry))
    expect(buildCourtWeekChirpPlan(registry, undefined, planReview(registry))).toEqual(first)
    expect(first.jobs).toHaveLength(380)
    expect(first.characterTotals).toEqual({
      billingUnit: 'unicode-code-points', canonicalCharacters: 52_950, providerCharacters: 52_950,
    })
    expect(first.voiceTotals).toHaveLength(28)
    expect(new Set(first.jobs.map(({ actorId }) => actorId)).size).toBe(28)
    expect(new Set(first.voiceTotals.map(({ voiceId }) => voiceId)).size).toBe(28)
    expect([...new Set(first.jobs.flatMap(({ variant }) => variant ? [variant] : []))]).toEqual([
      'juror-promise:oath', 'juror-promise:affirmation',
      'murder:unanimous', 'murder:majority', 'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority', 'unable-to-agree:hung',
      'analysis:murder', 'analysis:manslaughter', 'analysis:not-guilty', 'analysis:unable-to-agree',
    ])
    expect(first.forensicLedgerDigest).toBe('sha256:dbca8deab1e729c825b0fb7b0feb292f08d5f5fe52b33e8b670dcefe74ddb300')
    expect(first.costEstimate.withinBudget).toBe(true)
    expect(first.costEstimate.estimatedAudMicros).toBeLessThanOrEqual(50_000_000)
    expect(first.generationGate.allowed).toBe(false)
    expect(first.generationGate.blockers).toEqual([
      ...COURT_WEEK_REVIEW_ROLES.map((role) => `human-signoff:${role}`),
      `pronounceability-review:${first.pronounceabilityReview.unresolvedFindingCount}-unresolved`,
      'perceptual-distinctness-review', 'atomic-content-media-cutover',
      'approved-pronunciation-projections', 'approved-performance-manifest',
    ])
    expect(first.pronounceabilityReview).toMatchObject({
      coverage: { actors: 28, turns: 380, runtimeVariants: 13 },
      affectedActorCount: 26, unresolvedFindingCount: 135,
    })
    expect(first.policy).toMatchObject({ stockVoicesOnly: true, donorRecordingsRequired: false, recurringSpendAud: 0 })
    expect(JSON.stringify(COURT_WEEK_SPEECH_CANDIDATES)).toBe(before)

    const grossUsdMicros = first.characterTotals.providerCharacters
      * GOOGLE_CHIRP3_SOURCE.pricing.usdMicrosPerMillionCharactersAfterFreeTier / 1_000_000
    const grossAudMicros = Math.ceil(
      grossUsdMicros * GOOGLE_CHIRP3_SOURCE.audConversion.audMicrosPerUsd / 1_000_000,
    )
    const bakeoff = readFileSync(new URL('../../../docs/COURT-WEEK-OFFLINE-VOICE-BAKEOFF.md', import.meta.url), 'utf8')
    expect(grossUsdMicros).toBe(1_588_500)
    expect(grossAudMicros).toBe(2_247_453)
    expect(bakeoff).toContain(`plans ${first.characterTotals.providerCharacters.toLocaleString('en-AU')} provider characters`)
    expect(bakeoff).toContain('about USD 1.59 / AUD 2.25')
  })

  it('keeps canonical words immutable and never applies pending pronunciation changes', () => {
    const registry = fixtureRegistry()
    const plan = buildCourtWeekChirpPlan(registry, undefined, planReview(registry))
    const rows = new Map(buildCourtWeekSpeechReviewLedger().rows.map((row) => [row.turnId, row]))
    expect(plan.jobs.reduce((total, job) => total + [...job.canonicalText].length, 0))
      .toBe(plan.characterTotals.canonicalCharacters)
    const projected = plan.jobs.filter(({ pronunciationProjections }) => pronunciationProjections.length)
    expect(projected).toHaveLength(0)
    expect(plan.jobs.every(({ canonicalText, pronunciationText }) => canonicalText === pronunciationText)).toBe(true)
    for (const job of plan.jobs) {
      expect(job.canonicalText).toBe(rows.get(job.jobId)?.text)
      const tokens = [...job.canonicalText.matchAll(/\S+/gu)]
      for (const trace of job.pronunciationProjections) {
        expect(job.canonicalText.slice(trace.canonicalStart, trace.canonicalEnd)).toBe(trace.canonical)
        expect(tokens[trace.tokenStart]?.index).toBeLessThanOrEqual(trace.canonicalStart)
        expect(tokens[trace.tokenEndExclusive - 1]?.index).toBeLessThan(trace.canonicalEnd)
      }
    }
  })

  it('applies an approved provider projection only to its reviewed exact occurrence', () => {
    const audit = buildCourtWeekPronounceabilityAudit()
    const target = audit.findings.find(({ kind, canonical }) =>
      kind === 'statute' && canonical === 's 18')!
    const disposition: PronounceabilityDisposition = {
      findingId: target.id,
      canonicalTextSha256: target.canonicalTextSha256,
      status: 'approved', action: 'provider-projection', spoken: 'section eighteen',
      rationale: 'Preserve the exact visible identifier while speaking it unambiguously.',
      reviewReference: 'review:exact-source', listeningReference: 'listen:section-18',
    }
    const registry = fixtureRegistry()
    const governance = fixturePerformanceManifest(registry)
    governance.pronunciationProjections.find(({ canonical }) => canonical === target.canonical)!.status = 'approved'
    const plan = buildCourtWeekChirpPlan(registry, COURT_WEEK_SPEECH_CANDIDATES, {
      dispositions: [disposition], performanceManifest: refreshPerformanceDigest(governance),
    })
    const projectedJobs = plan.jobs.filter(({ pronunciationProjections }) => pronunciationProjections.length)
    expect(projectedJobs).toHaveLength(1)
    expect(projectedJobs[0]).toMatchObject({
      jobId: target.turnId,
      pronunciationProjections: [{
        findingId: target.id,
        canonicalTextSha256: target.canonicalTextSha256,
        canonical: target.canonical,
        spoken: disposition.spoken,
        canonicalStart: target.utf16Start,
        canonicalEnd: target.utf16EndExclusive,
      }],
    })
    expect(plan.pronounceabilityReview).toMatchObject({
      approvedFindingCount: 1,
      unresolvedFindingCount: audit.findings.length - 1,
    })
    expect(plan.generationGate.blockers).toContain(
      `pronounceability-review:${audit.findings.length - 1}-unresolved`,
    )
    expect(plan.jobs.filter(({ canonicalText }) => canonicalText.includes(target.canonical))).toHaveLength(
      audit.findings.filter(({ canonical }) => canonical === target.canonical).length,
    )
  })

  it('rejects stale or ungoverned pronunciation dispositions', () => {
    const registry = fixtureRegistry()
    const target = buildCourtWeekPronounceabilityAudit().findings.find(({ kind }) => kind === 'identifier')!
    const disposition: PronounceabilityDisposition = {
      findingId: target.id,
      canonicalTextSha256: target.canonicalTextSha256,
      status: 'approved', action: 'provider-projection', spoken: 'different words',
      rationale: 'test-only invalid projection',
      reviewReference: 'review:test', listeningReference: 'listen:test',
    }
    expect(() => buildCourtWeekChirpPlan(registry, COURT_WEEK_SPEECH_CANDIDATES, planReview(registry, {
      dispositions: [{ ...disposition, canonicalTextSha256: `sha256:${'0'.repeat(64)}` }],
    }))).toThrow(/digest is stale/i)
    expect(() => buildCourtWeekChirpPlan(registry, COURT_WEEK_SPEECH_CANDIDATES, planReview(registry, {
      dispositions: [disposition],
    }))).toThrow(/not approved by the performance manifest/i)
  })

  it('binds every planned identity and voice to the v2 performance manifest', () => {
    const registry = fixtureRegistry()
    expect(() => buildCourtWeekChirpPlan(registry, undefined, {
      performanceManifest: buildCourtWeekPerformanceManifest(),
    })).toThrow(/lacks its Chirp stock-voice assignment/i)
    const mismatched = fixturePerformanceManifest(registry)
    const first = mismatched.identities[0]!.assignment!
    const second = mismatched.identities[1]!.assignment!
    const firstVoice = first.voiceProfileId
    first.voiceProfileId = second.voiceProfileId
    second.voiceProfileId = firstVoice
    expect(() => buildCourtWeekChirpPlan(registry, undefined, {
      performanceManifest: refreshPerformanceDigest(mismatched),
    })).toThrow(/do not match the closed Chirp registry/i)
  })

  it('rejects role sharing, unknown voices and incomplete closed registries', () => {
    const shared = fixtureRegistry()
    shared.assignments[1]!.voiceId = shared.assignments[0]!.voiceId
    expect(() => validateChirpRegistry(shared)).toThrow(/may not share/i)
    const unknown = fixtureRegistry()
    unknown.assignments[0]!.voiceId = 'TEST-ONLY-UNKNOWN'
    expect(() => validateChirpRegistry(unknown)).toThrow(/unknown voices/i)
    const missing = fixtureRegistry() as unknown as { assignments: unknown[] }
    missing.assignments.pop()
    expect(() => validateChirpRegistry(missing)).toThrow()
  })

  it('rejects missing dynamic variants and estimates that exceed AUD 50', () => {
    const missingVariant = COURT_WEEK_SPEECH_CANDIDATES.map((day) => day.day === 'sunday'
      ? { ...day, variants: day.variants.slice(1) } : day)
    const registry = fixtureRegistry()
    expect(() => buildCourtWeekChirpPlan(registry, missingVariant, planReview(registry))).toThrow(/runtime branches/i)
    const costly = fixtureRegistry()
    costly.pricing.usdMicrosPerMillionCharacters = 2_000_000_000
    expect(() => buildCourtWeekChirpPlan(costly, undefined, planReview(costly))).toThrow(/AUD 50/i)
  })

  it('requires pinned authoritative inputs and cannot export into shipped assets', () => {
    const unpinned = fixtureRegistry()
    unpinned.inventory.sourceSha256 = 'pending'
    expect(() => validateChirpRegistry(unpinned)).toThrow()
    const unofficial = fixtureRegistry()
    unofficial.inventory.sourceUrl = 'https://example.invalid/voices'
    expect(() => validateChirpRegistry(unofficial)).toThrow(/Official Google Cloud/i)
    expect(() => writeCourtWeekChirpPlan('unused.json', 'unused-manifest.json', resolve(process.cwd(), 'public/chirp-plan.json')))
      .toThrow(/runtime or Cloudflare/i)
    const temporary = mkdtempSync(join(tmpdir(), 'simjury-chirp-plan-'))
    try {
      const registryPath = join(temporary, 'registry.json')
      const performanceManifestPath = join(temporary, 'performance-manifest.json')
      const outputPath = join(temporary, 'plan.json')
      const registry = fixtureRegistry()
      writeFileSync(registryPath, JSON.stringify(registry))
      writeFileSync(performanceManifestPath, JSON.stringify(fixturePerformanceManifest(registry)))
      writeCourtWeekChirpPlan(registryPath, performanceManifestPath, outputPath)
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).jobs).toHaveLength(380)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
    const source = readFileSync(new URL('./court-week-chirp-plan.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(|node:https|node:http|@google-cloud|child_process|process\.env/u)
  })
})
