import { describe, expect, it } from 'vitest'
import {
  assessPronounceability,
  buildCourtWeekPronounceabilityAudit,
  scanPronounceabilityText,
  type PronounceabilityDisposition,
  type PronounceabilityFinding,
} from './court-week-pronounceability'

const disposition = (
  finding: PronounceabilityFinding,
  overrides: Partial<PronounceabilityDisposition> = {},
): PronounceabilityDisposition => ({
  findingId: finding.id,
  canonicalTextSha256: finding.canonicalTextSha256,
  status: 'pending',
  action: 'rewrite-source',
  ...overrides,
})

describe('Court Week pronounceability gate', () => {
  it('deterministically inventories every reviewed name, turn and runtime branch', () => {
    const first = buildCourtWeekPronounceabilityAudit()
    expect(buildCourtWeekPronounceabilityAudit()).toEqual(first)
    expect(first.counts).toMatchObject({
      'speaker-name': 24,
      clock: 3,
      statute: 6,
      identifier: 4,
      abbreviation: 0,
      homograph: 63,
      'all-caps': 5,
      number: 1,
      'hyphenated-construction': 40,
      'em-dash': 8,
    })
    expect(first.findings).toHaveLength(154)
    expect(first.findings).toHaveLength(Object.values(first.counts).reduce((sum, count) => sum + count, 0))
    expect(new Set(first.findings.map(({ id }) => id)).size).toBe(first.findings.length)
    for (const entry of first.findings) {
      expect(entry.utf16EndExclusive).toBeGreaterThan(entry.utf16Start)
      expect(entry.tokenEndExclusive).toBeGreaterThan(entry.tokenStart)
    }
    expect(first.coverage).toEqual({ actors: 28, turns: 379, runtimeVariants: 13 })
    expect(first.impact.actorIds).toHaveLength(26)
    expect(first.impact.runtimeVariants).toHaveLength(11)
    expect(first.auditDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('classifies specific notation before its component capitals and digits', () => {
    const findings = scanPronounceabilityText(
      'judge', 'fixture', 'At 21:16, Dr. Vos read AR-72 and SHA-256—then marked READY at 5%.',
    )
    expect(findings.map(({ kind, canonical }) => [kind, canonical])).toEqual([
      ['clock', '21:16'], ['abbreviation', 'Dr.'], ['homograph', 'read'],
      ['identifier', 'AR-72'], ['identifier', 'SHA-256'], ['em-dash', '—'],
      ['all-caps', 'READY'], ['number', '5%'],
    ])
  })

  it('accepts conventionally hyphenated spoken numbers without hiding other compounds', () => {
    expect(scanPronounceabilityText('judge', 'safe-number', 'Section forty-one applied at twenty-one sixteen.'))
      .toEqual([])
    expect(scanPronounceabilityText('judge', 'unsafe-compound', 'The launch-ready craft remained evidence-linked.'))
      .toMatchObject([
        { kind: 'hyphenated-construction', canonical: 'launch-ready' },
        { kind: 'hyphenated-construction', canonical: 'evidence-linked' },
      ])
  })

  it('requires source rewrites for ordinary hazards and rejects hidden name pronunciation', () => {
    const [clock] = scanPronounceabilityText('judge', 'clock', 'Return at 21:16.')
    const name = buildCourtWeekPronounceabilityAudit().findings.find(({ kind }) => kind === 'speaker-name')!
    expect(() => assessPronounceability([clock], [disposition(clock, {
      action: 'provider-projection', spoken: 'twenty-one sixteen', rationale: 'test',
    })])).toThrow(/limited to statutes and identifiers/i)
    expect(() => assessPronounceability([name], [disposition(name, {
      action: 'provider-projection', spoken: 'phonetic name', rationale: 'test',
    })])).toThrow(/limited to statutes and identifiers/i)
    expect(assessPronounceability([name], [disposition(name, {
      status: 'approved', action: 'retain-reviewed-name',
      reviewReference: 'review:name', listeningReference: 'listen:name',
    })])).toMatchObject({ allowed: true })
    expect(() => assessPronounceability([clock], [disposition(clock, {
      status: 'approved', action: 'rewrite-source', listeningReference: 'test-listen',
    })])).toThrow(/remains unresolved/i)
  })

  it('binds the narrow projection exception to exact source and listening evidence', () => {
    const [identifier] = scanPronounceabilityText('tovan-mir', 'identifier', 'I checked AR-72.')
    const approved = disposition(identifier, {
      status: 'approved', action: 'provider-projection', spoken: 'A R seven two',
      rationale: 'The exact identifier remains visible in the admitted record.',
      reviewReference: 'review:content', listeningReference: 'review:test-listen',
    })
    expect(assessPronounceability([identifier], [approved])).toEqual({
      allowed: true, unresolvedFindingIds: [],
    })
    expect(() => assessPronounceability([identifier], [{
      ...approved, canonicalTextSha256: `sha256:${'0'.repeat(64)}`,
    }])).toThrow(/digest is stale/i)
    expect(() => assessPronounceability([identifier], [{
      ...approved, listeningReference: '',
    }])).toThrow(/review and listening references/i)
    expect(() => assessPronounceability([identifier], [{
      ...approved, spoken: '<say-as>A R seven two</say-as>',
    }])).toThrow(/ordinary words/i)
    expect(() => assessPronounceability([identifier], [{
      ...approved, findingId: `sha256:${'1'.repeat(64)}`,
    }])).toThrow(/stale or unknown/i)
  })

  it('blocks missing, pending and duplicate decisions', () => {
    const [statute] = scanPronounceabilityText('judge', 'statute', 'Apply s 18.')
    expect(assessPronounceability([statute], [])).toMatchObject({ allowed: false })
    expect(assessPronounceability([statute], [disposition(statute)])).toMatchObject({ allowed: false })
    expect(() => assessPronounceability(
      [statute], [disposition(statute), disposition(statute)],
    )).toThrow(/must be unique/i)
  })
})
