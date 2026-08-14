import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COURT_WEEK_SPEECH_CANDIDATES, buildCourtWeekSpeechReviewLedger } from '../src/courtweek/content/speechReviewLedger'
import { CANONICAL_PERFORMANCE_IDENTITIES } from './court-week-performance-manifest'
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
  const voiceIds = CANONICAL_PERFORMANCE_IDENTITIES
    .map((_, index) => `TEST-ONLY-VOICE-${String(index + 1).padStart(2, '0')}`).sort()
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

describe('offline Court Week Chirp 3 HD plan', () => {
  it('maps every explicit candidate and runtime variant deterministically to 28 stock voices', () => {
    const before = JSON.stringify(COURT_WEEK_SPEECH_CANDIDATES)
    const first = buildCourtWeekChirpPlan(fixtureRegistry())
    expect(buildCourtWeekChirpPlan(fixtureRegistry())).toEqual(first)
    expect(first.jobs).toHaveLength(288)
    expect(first.characterTotals).toEqual({
      billingUnit: 'unicode-code-points', canonicalCharacters: 45_158, providerCharacters: 45_260,
    })
    expect(first.voiceTotals).toHaveLength(28)
    expect(new Set(first.jobs.map(({ actorId }) => actorId)).size).toBe(28)
    expect(new Set(first.voiceTotals.map(({ voiceId }) => voiceId)).size).toBe(28)
    expect([...new Set(first.jobs.flatMap(({ variant }) => variant ? [variant] : []))]).toEqual([
      'murder:unanimous', 'murder:majority', 'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority', 'unable-to-agree:hung',
      'analysis:murder', 'analysis:manslaughter', 'analysis:not-guilty', 'analysis:unable-to-agree',
    ])
    expect(first.forensicLedgerDigest).toBe('sha256:9d9918e825d618c899939d45156bd97a5fa654b8ec13092a7943e4b981931396')
    expect(first.costEstimate.withinBudget).toBe(true)
    expect(first.costEstimate.estimatedAudMicros).toBeLessThanOrEqual(50_000_000)
    expect(first.generationGate.allowed).toBe(false)
    expect(first.generationGate.blockers).toEqual([
      ...COURT_WEEK_REVIEW_ROLES.map((role) => `human-signoff:${role}`),
      'atomic-content-media-cutover', 'approved-pronunciation-projections', 'approved-performance-manifest',
    ])
    expect(first.policy).toMatchObject({ stockVoicesOnly: true, donorRecordingsRequired: false, recurringSpendAud: 0 })
    expect(JSON.stringify(COURT_WEEK_SPEECH_CANDIDATES)).toBe(before)
  })

  it('keeps canonical words immutable and traces pronunciation changes to characters and tokens', () => {
    const plan = buildCourtWeekChirpPlan(fixtureRegistry())
    const rows = new Map(buildCourtWeekSpeechReviewLedger().rows.map((row) => [row.turnId, row]))
    expect(plan.jobs.reduce((total, job) => total + [...job.canonicalText].length, 0))
      .toBe(plan.characterTotals.canonicalCharacters)
    const projected = plan.jobs.filter(({ pronunciationProjections }) => pronunciationProjections.length)
    expect(projected).toHaveLength(6)
    expect(projected.flatMap(({ pronunciationProjections }) => pronunciationProjections)).toHaveLength(8)
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
    expect(() => buildCourtWeekChirpPlan(fixtureRegistry(), missingVariant)).toThrow(/runtime branches/i)
    const costly = fixtureRegistry()
    costly.pricing.usdMicrosPerMillionCharacters = 2_000_000_000
    expect(() => buildCourtWeekChirpPlan(costly)).toThrow(/AUD 50/i)
  })

  it('requires pinned authoritative inputs and cannot export into shipped assets', () => {
    const unpinned = fixtureRegistry()
    unpinned.inventory.sourceSha256 = 'pending'
    expect(() => validateChirpRegistry(unpinned)).toThrow()
    const unofficial = fixtureRegistry()
    unofficial.inventory.sourceUrl = 'https://example.invalid/voices'
    expect(() => validateChirpRegistry(unofficial)).toThrow(/Official Google Cloud/i)
    expect(() => writeCourtWeekChirpPlan('unused.json', resolve(process.cwd(), 'public/chirp-plan.json')))
      .toThrow(/runtime or Cloudflare/i)
    const temporary = mkdtempSync(join(tmpdir(), 'simjury-chirp-plan-'))
    try {
      const registryPath = join(temporary, 'registry.json')
      const outputPath = join(temporary, 'plan.json')
      writeFileSync(registryPath, JSON.stringify(fixtureRegistry()))
      writeCourtWeekChirpPlan(registryPath, outputPath)
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).jobs).toHaveLength(288)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
    const source = readFileSync(new URL('./court-week-chirp-plan.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/\bfetch\s*\(|node:https|node:http|@google-cloud|child_process|process\.env/u)
  })
})
