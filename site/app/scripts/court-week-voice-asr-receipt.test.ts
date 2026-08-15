import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertVoiceAsrReceiptPath, canonicalWords, courtWeekVoiceActivationProjectionDigest, courtWeekVoiceMediaDigest, runVoiceAsrReceiptCli,
  validateVoiceAsrReceipt, VOICE_ASR_RECEIPT_SCHEMA, VOICE_ASR_THRESHOLDS, WHISPER_ASR_TOOLCHAIN, type VoiceAsrContext, type VoiceAsrReceipt,
} from './court-week-voice-asr-receipt'
const digest = (character: string) => `sha256:${character.repeat(64)}`
const sha256 = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const evidenceBytes = new Map<string, Uint8Array>()
const resolveEvidence = (path: string) => {
  const bytes = evidenceBytes.get(path); if (!bytes) throw new Error(`Missing fixture evidence: ${path}`); return bytes
}
const artifact = (kind: string, value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value)); const sha = sha256(bytes)
  const path = `content-reviews/${kind}-${sha.slice(7)}.json`; evidenceBytes.set(resolve(path), bytes)
  return { path, sha256: sha }
}
function rebindEvidence(candidate: VoiceAsrReceipt) {
  candidate.evidence = {
    rawAsr: artifact('raw-asr', { schema: 'simjury.court-week-raw-asr/v1', utterances: candidate.utterances.map(
      ({ turnId, mediaSha256, asrTokens }) => ({ turnId, mediaSha256, tokens: asrTokens })) }),
    rawAlignment: artifact('raw-alignment', { schema: 'simjury.court-week-raw-alignment/v1',
      utterances: candidate.utterances.map(({ turnId, mediaSha256, alignment }) => ({ turnId, mediaSha256,
        words: alignment.map(({ canonicalIndex, canonical, observedStartMs, observedEndMs }) =>
          ({ canonicalIndex, canonical, observedStartMs, observedEndMs })) })) }),
  }
}
const validate = (value: unknown, expected: VoiceAsrContext) => validateVoiceAsrReceipt(value, expected, resolveEvidence)
function context(text = Array(100).fill('word').join(' ')): VoiceAsrContext {
  const words = canonicalWords(text); const value = { caseId: 'cw-0001', revision: 'candidate-r1', candidateDigest: digest('a'),
    sourceContract: 'explicit-candidate', sourceDigest: digest('b'), performanceDigest: digest('c'),
    activationProjectionDigest: digest('e'), mediaDigest: digest('d'), turns: [{ turnId: 'turn-1',
      actorId: 'witness-helen-mercer', displayLabel: 'Helen Mercer', text, referenceBoundaries: words.map(
        (_, index) => ({ startMs: index * 20, endMs: index * 20 + 10 })) }] } satisfies VoiceAsrContext
  value.activationProjectionDigest = courtWeekVoiceActivationProjectionDigest(value); return value
}
function receipt(expected = context()): VoiceAsrReceipt {
  const utterances: VoiceAsrReceipt['utterances'] = expected.turns.map(({ turnId, text }) => {
    const words = canonicalWords(text); return { turnId, canonicalTextSha256: sha256(text), mediaSha256: sha256(turnId),
    durationMs: words.length * 20 + 60, asrTokens: words.map(({ raw }) => raw), discrepancies: [],
    alignment: words.map(({ raw }, index) => ({ canonicalIndex: index, canonical: raw,
      observedStartMs: index * 20 + 40, observedEndMs: index * 20 + 50,
      referenceStartMs: index * 20, referenceEndMs: index * 20 + 10 })),
    } })
  const mediaDigest = courtWeekVoiceMediaDigest(utterances); expected.mediaDigest = mediaDigest
  const candidate = { schema: VOICE_ASR_RECEIPT_SCHEMA, caseId: 'cw-0001', revision: expected.revision,
    bindings: { candidateDigest: expected.candidateDigest, sourceDigest: expected.sourceDigest,
      performanceDigest: expected.performanceDigest, activationProjectionDigest: expected.activationProjectionDigest,
      mediaDigest },
    evidence: { rawAsr: { path: 'pending', sha256: digest('0') }, rawAlignment: { path: 'pending', sha256: digest('0') } },
    toolchain: { ...WHISPER_ASR_TOOLCHAIN }, thresholds: { ...VOICE_ASR_THRESHOLDS }, utterances } satisfies VoiceAsrReceipt
  rebindEvidence(candidate); return candidate
}
const resolved = (canonicalIndex: number, asrIndex: number, canonical: string, asr: string) => ({
  kind: 'substitution' as const, canonicalIndex, asrIndex, canonical, asr,
  resolution: { disposition: 'asr-only' as const, listeningReference: 'listen:review-42' },
})
describe('offline Whisper ASR and forced-alignment receipt', () => {
  it('normalises real curly apostrophes without changing the visible canonical token', () => expect(canonicalWords('juror’s')).toEqual([{ raw: 'juror’s', normalized: "juror's" }]))
  it('accepts exact full coverage and pins the offline engine, weights and thresholds', () => {
    const expected = context(); const candidate = receipt(expected)
    expect(validate(candidate, expected)).toEqual({ verified: true,
      canonicalWords: 100, discrepancies: 0, criticalDiscrepancies: 0,
      unresolvedCriticalDiscrepancies: 0, medianBoundaryErrorMs: 40,
      p95BoundaryErrorMs: 40, wordErrorRate: 0 })
    expect(candidate.toolchain).toEqual(WHISPER_ASR_TOOLCHAIN)
    const aliases = context(); aliases.turns[0]!.actorId = 'edda-rook'; aliases.turns[0]!.displayLabel = 'Edda Rook'
    aliases.turns = [...aliases.turns, { ...aliases.turns[0]!, turnId: 'turn-2', displayLabel: 'Foreperson Edda Rook' }]; aliases.activationProjectionDigest = courtWeekVoiceActivationProjectionDigest(aliases)
    expect(validate(receipt(aliases), aliases)).toMatchObject({ verified: true, canonicalWords: 200 })
    expect(() => validate({ ...candidate,
      toolchain: { ...candidate.toolchain, revision: '0'.repeat(40) } }, expected)).toThrow()
  })
  it('rejects stale source/media bindings and public or runtime receipt paths', () => {
    const expected = context(); const candidate = receipt(expected)
    expect(() => validate({ ...candidate, bindings: { ...candidate.bindings,
      candidateDigest: digest('0') } }, expected)).toThrow(/stale case or digest/i)
    expected.turns[0]!.displayLabel = 'Helen Marsh'; expect(() => validate(candidate, expected)).toThrow(/activation projection/i); expected.turns[0]!.displayLabel = 'Helen Mercer'
    candidate.utterances[0]!.mediaSha256 = digest('1')
    expect(() => validate(candidate, expected)).toThrow(/ordered audio hashes/i)
    expect(() => assertVoiceAsrReceiptPath('public/receipt.json')).toThrow(/review-only/i)
    expect(() => assertVoiceAsrReceiptPath('src/receipt.json')).toThrow(/review-only/i)
    expect(assertVoiceAsrReceiptPath('content-reviews/receipt.json')).toContain('content-reviews')
    expect(() => runVoiceAsrReceiptCli()).toThrow(/blocked.*explicit-candidate/i)
  })
  it('re-hashes content-addressed evidence and rejects a hand-authored projection', () => {
    const expected = context(); const candidate = receipt(expected)
    evidenceBytes.set(resolve(candidate.evidence.rawAsr.path), new TextEncoder().encode('{}'))
    expect(() => validate(candidate, expected)).toThrow(/bound SHA-256/i)
    rebindEvidence(candidate); candidate.utterances[0]!.asrTokens[0] = 'invented'
    expect(() => validate(candidate, expected)).toThrow(/differs from raw ASR/i)
    candidate.evidence.rawAsr.path = 'content-reviews/raw-asr.json'
    expect(() => validate(candidate, expected)).toThrow(/content-addressed/i)
  })
  it.each([
    ['missing', (value: VoiceAsrReceipt) => value.utterances[0]!.alignment.pop()],
    ['duplicate', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.canonicalIndex = 0 }],
    ['reordered', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.canonical = 'invented' }],
    ['non-monotonic', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.observedStartMs = 5 }],
  ])('rejects %s canonical word alignment', (_label, mutate) => {
    const expected = context(); const candidate = receipt(expected); mutate(candidate); rebindEvidence(candidate)
    expect(() => validate(candidate, expected)).toThrow(/alignment|canonical word/i)
  })
  it('enforces median and p95 forced-alignment limits', () => {
    for (const [count, error, message] of [[51, 101, /median/i], [6, 251, /p95/i]] as const) {
      const expected = context(); const candidate = receipt(expected)
      candidate.utterances[0]!.alignment.slice(-count).forEach((word) => {
        word.observedStartMs = word.referenceStartMs + error; word.observedEndMs = word.referenceEndMs + error })
      candidate.utterances[0]!.durationMs += error; rebindEvidence(candidate)
      expect(() => validate(candidate, expected)).toThrow(message)
    }
  })
  it('allows exactly 1% ASR error only with an ASR-only listening resolution', () => {
    const expected = context(['not', ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
    candidate.utterances[0]!.asrTokens[0] = 'heard'
    candidate.utterances[0]!.discrepancies = [resolved(0, 0, 'not', 'heard')]; rebindEvidence(candidate)
    expect(validate(candidate, expected)).toMatchObject({
      wordErrorRate: 0.01, criticalDiscrepancies: 1, unresolvedCriticalDiscrepancies: 0,
    })
    const unreferenced = structuredClone(candidate)
    unreferenced.utterances[0]!.discrepancies[0]!.resolution.listeningReference = ''
    expect(() => validate(unreferenced, expected)).toThrow()
    candidate.utterances[0]!.asrTokens[1] = 'wrong'
    candidate.utterances[0]!.discrepancies.push(resolved(1, 1, 'word', 'wrong')); rebindEvidence(candidate)
    expect(() => validate(candidate, expected)).toThrow(/word error rate/i)
  })
  it('fails closed on unresolved names, numbers, negation and legal-standard words', () => {
    for (const critical of ['Mara', 'eleven', 'not', 'section', 'murder', 'burden', 'reasonable', 'doubt', 'intent', 'death', 'injury', 'duty', 'causation', 'unanimous', 'majority', 'agreement']) {
      const expected = context([critical, ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
      candidate.utterances[0]!.asrTokens[0] = 'other'; rebindEvidence(candidate)
      expect(() => validate(candidate, expected)).toThrow(/unresolved critical/i)
    }
  })
  it('derives final-cast name criticality from the bound candidate, not the legacy registry', () => {
    const expected = context(['helen', ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
    const omitted = structuredClone(expected); omitted.turns[0]!.displayLabel = ''; expect(() => validate(candidate, omitted)).toThrow(/reviewed actor identity/i)
    candidate.utterances[0]!.asrTokens[0] = 'other'; rebindEvidence(candidate)
    expect(() => validate(candidate, expected)).toThrow(/unresolved critical.*helen/i)
  })
})
