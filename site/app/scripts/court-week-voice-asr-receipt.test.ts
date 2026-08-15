import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assertVoiceAsrReceiptPath, canonicalWords, courtWeekVoiceActivationProjectionDigest, courtWeekVoiceMediaDigest, runVoiceAsrReceiptCli,
  validateVoiceAsrReceipt, VOICE_ASR_RECEIPT_SCHEMA, VOICE_ASR_THRESHOLDS, WHISPER_ASR_TOOLCHAIN, type VoiceAsrContext, type VoiceAsrReceipt,
} from './court-week-voice-asr-receipt'
const digest = (character: string) => `sha256:${character.repeat(64)}`
const sha256 = (value: string | Uint8Array) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = mkdtempSync(join(appRoot, 'content-reviews', '.voice-asr-test-'))
const externalRoot = mkdtempSync(join(tmpdir(), 'simjury-voice-asr-'))
afterAll(() => { rmSync(fixtureRoot, { recursive: true, force: true }); rmSync(externalRoot, { recursive: true, force: true }) })
const repositoryPath = (target: string) => relative(appRoot, target).replace(/\\/gu, '/')
const resolveEvidence = (path: string) => readFileSync(path)
const artifact = (kind: string, value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value)); const sha = sha256(bytes)
  const target = join(fixtureRoot, `${kind}-${sha.slice(7)}.json`); writeFileSync(target, bytes)
  return { path: repositoryPath(target), sha256: sha }
}
function rebindEvidence(candidate: VoiceAsrReceipt, expected: VoiceAsrContext, trustRun = true) {
  const provenance = { run: candidate.evidence.run, toolchain: candidate.toolchain, bindings: candidate.bindings }
  candidate.evidence = {
    run: candidate.evidence.run,
    rawAsr: artifact('raw-asr', { schema: 'simjury.court-week-raw-asr/v1', provenance,
      utterances: candidate.utterances.map(
      ({ turnId, mediaSha256, durationMs, asrTokens }) => ({ turnId, mediaSha256, durationMs, tokens: asrTokens })) }),
    rawAlignment: artifact('raw-alignment', { schema: 'simjury.court-week-raw-alignment/v1', provenance,
      utterances: candidate.utterances.map(({ turnId, mediaSha256, durationMs, alignment }) => ({ turnId, mediaSha256, durationMs,
        words: alignment.map(({ canonicalIndex, canonical, observedStartMs, observedEndMs }) =>
          ({ canonicalIndex, canonical, observedStartMs, observedEndMs })) })) }),
  }
  if (trustRun) expected.validatedRun = { ...candidate.evidence.run,
    rawAsrSha256: candidate.evidence.rawAsr.sha256, rawAlignmentSha256: candidate.evidence.rawAlignment.sha256 }
}
const validate = (value: unknown, expected: VoiceAsrContext) => validateVoiceAsrReceipt(value, expected, resolveEvidence)
const hundredWords = Array(100).fill('word').join(' ')
function context(text: string | readonly string[] = hundredWords): VoiceAsrContext {
  const texts = typeof text === 'string' ? [text] : text
  const turns = texts.map((turnText, index) => { const turnId = `turn-${index + 1}`; const words = canonicalWords(turnText); return {
    turnId, actorId: 'witness-helen-mercer', displayLabel: 'Helen Mercer', text: turnText,
    mediaSha256: sha256(turnId), durationMs: words.length * 20 + 400,
    referenceBoundaries: words.map((_, wordIndex) => ({ startMs: wordIndex * 20, endMs: wordIndex * 20 + 10 })),
  } })
  const value = { caseId: 'cw-0001', revision: 'candidate-r1', candidateDigest: digest('a'),
    sourceContract: 'explicit-candidate', sourceDigest: digest('b'), performanceDigest: digest('c'),
    activationProjectionDigest: digest('e'), mediaContract: 'validated-candidate-media', mediaDigest: courtWeekVoiceMediaDigest(turns),
    validatedRun: { id: 'asr-run:fixture-001', runnerRevision: 'f'.repeat(40), invocationSha256: digest('9'),
      rawAsrSha256: digest('0'), rawAlignmentSha256: digest('0') }, turns } satisfies VoiceAsrContext
  value.activationProjectionDigest = courtWeekVoiceActivationProjectionDigest(value); return value
}
function receipt(expected = context()): VoiceAsrReceipt {
  const utterances: VoiceAsrReceipt['utterances'] = expected.turns.map(({ turnId, text, mediaSha256, durationMs }) => {
    const words = canonicalWords(text); return { turnId, canonicalTextSha256: sha256(text), mediaSha256,
    durationMs, asrTokens: words.map(({ raw }) => raw), discrepancies: [],
    alignment: words.map(({ raw }, index) => ({ canonicalIndex: index, canonical: raw,
      observedStartMs: index * 20 + 40, observedEndMs: index * 20 + 50,
      referenceStartMs: index * 20, referenceEndMs: index * 20 + 10 })),
    } })
  const mediaDigest = courtWeekVoiceMediaDigest(utterances)
  const run = { id: expected.validatedRun.id, runnerRevision: expected.validatedRun.runnerRevision,
    invocationSha256: expected.validatedRun.invocationSha256 }
  const candidate = { schema: VOICE_ASR_RECEIPT_SCHEMA, caseId: 'cw-0001', revision: expected.revision,
    bindings: { candidateDigest: expected.candidateDigest, sourceDigest: expected.sourceDigest,
      performanceDigest: expected.performanceDigest, activationProjectionDigest: expected.activationProjectionDigest,
      mediaDigest },
    evidence: { run, rawAsr: { path: 'pending', sha256: digest('0') }, rawAlignment: { path: 'pending', sha256: digest('0') } },
    toolchain: { ...WHISPER_ASR_TOOLCHAIN }, thresholds: { ...VOICE_ASR_THRESHOLDS }, utterances } satisfies VoiceAsrReceipt
  rebindEvidence(candidate, expected); return candidate
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
    const aliases = context([hundredWords, hundredWords]); aliases.turns[0]!.actorId = 'edda-rook'; aliases.turns[0]!.displayLabel = 'Edda Rook'
    aliases.turns[1]!.actorId = 'edda-rook'; aliases.turns[1]!.displayLabel = 'Foreperson Edda Rook'; aliases.activationProjectionDigest = courtWeekVoiceActivationProjectionDigest(aliases)
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
    const inflated = receipt(expected); inflated.utterances[0]!.durationMs += 5_000
    expect(() => validate(inflated, expected)).toThrow(/audio hashes and durations/i)
    expect(() => assertVoiceAsrReceiptPath('public/receipt.json')).toThrow(/review-only/i)
    expect(() => assertVoiceAsrReceiptPath('src/receipt.json')).toThrow(/review-only/i)
    expect(assertVoiceAsrReceiptPath(inflated.evidence.rawAsr.path)).toContain('content-reviews')
    expect(() => runVoiceAsrReceiptCli()).toThrow(/blocked.*explicit-candidate/i)
  })
  it('re-hashes content-addressed evidence and rejects a hand-authored projection', () => {
    const expected = context(); const candidate = receipt(expected)
    writeFileSync(resolve(appRoot, candidate.evidence.rawAsr.path), '{}')
    expect(() => validate(candidate, expected)).toThrow(/bound SHA-256/i)
    rebindEvidence(candidate, expected); candidate.utterances[0]!.asrTokens[0] = 'invented'
    rebindEvidence(candidate, expected, false)
    expect(() => validate(candidate, expected)).toThrow(/validated toolchain run/i)
    expected.validatedRun.rawAsrSha256 = candidate.evidence.rawAsr.sha256
    const unaddressed = join(fixtureRoot, 'raw-asr.json')
    writeFileSync(unaddressed, readFileSync(resolve(appRoot, candidate.evidence.rawAsr.path)))
    candidate.evidence.rawAsr.path = repositoryPath(unaddressed)
    expect(() => validate(candidate, expected)).toThrow(/content-addressed/i)
  })
  it('binds both raw artifacts to one trusted run and rejects symlink escape', () => {
    const expected = context(); const candidate = receipt(expected)
    const raw = JSON.parse(readFileSync(resolve(appRoot, candidate.evidence.rawAsr.path), 'utf8')) as {
      provenance: { run: { id: string } }
    }
    raw.provenance.run.id = 'asr-run:forged-001'; candidate.evidence.rawAsr = artifact('raw-asr-forged', raw)
    expected.validatedRun.rawAsrSha256 = candidate.evidence.rawAsr.sha256
    expect(() => validate(candidate, expected)).toThrow(/bound run and toolchain provenance/i)

    const wrongToolchain = receipt(expected)
    const wrongRaw = JSON.parse(readFileSync(resolve(appRoot, wrongToolchain.evidence.rawAsr.path), 'utf8'))
    wrongRaw.provenance.toolchain.revision = '0'.repeat(40)
    wrongToolchain.evidence.rawAsr = artifact('raw-asr-wrong-toolchain', wrongRaw)
    expected.validatedRun.rawAsrSha256 = wrongToolchain.evidence.rawAsr.sha256
    expect(() => validate(wrongToolchain, expected)).toThrow()

    const escaped = receipt(expected); const targetName = basename(resolve(appRoot, escaped.evidence.rawAsr.path))
    writeFileSync(join(externalRoot, targetName), readFileSync(resolve(appRoot, escaped.evidence.rawAsr.path)))
    const linkedOutside = join(fixtureRoot, 'linked-outside')
    symlinkSync(externalRoot, linkedOutside, process.platform === 'win32' ? 'junction' : 'dir')
    escaped.evidence.rawAsr.path = repositoryPath(join(linkedOutside, targetName))
    expect(() => validate(escaped, expected)).toThrow(/resolved outside.*review-only/i)
  })
  it.each([
    ['missing', (value: VoiceAsrReceipt) => value.utterances[0]!.alignment.pop()],
    ['duplicate', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.canonicalIndex = 0 }],
    ['reordered', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.canonical = 'invented' }],
    ['non-monotonic', (value: VoiceAsrReceipt) => { value.utterances[0]!.alignment[1]!.observedStartMs = 5 }],
  ])('rejects %s canonical word alignment', (_label, mutate) => {
    const expected = context(); const candidate = receipt(expected); mutate(candidate); rebindEvidence(candidate, expected)
    expect(() => validate(candidate, expected)).toThrow(/alignment|canonical word/i)
  })
  it('enforces median and p95 forced-alignment limits', () => {
    for (const [count, error, message] of [[51, 101, /median/i], [6, 251, /p95/i]] as const) {
      const expected = context(); const candidate = receipt(expected)
      candidate.utterances[0]!.alignment.slice(-count).forEach((word) => {
        word.observedStartMs = word.referenceStartMs + error; word.observedEndMs = word.referenceEndMs + error })
      rebindEvidence(candidate, expected)
      expect(() => validate(candidate, expected)).toThrow(message)
    }
  })
  it('enforces alignment limits independently for every utterance', () => {
    const expected = context([hundredWords, 'word word word word']); const candidate = receipt(expected)
    candidate.utterances[1]!.alignment.forEach((word) => {
      word.observedStartMs = word.referenceStartMs + 251; word.observedEndMs = word.referenceEndMs + 251
    }); rebindEvidence(candidate, expected)
    expect(() => validate(candidate, expected)).toThrow(/turn-2: .*alignment error/i)
  })
  it('allows exactly 1% ASR error only with an ASR-only listening resolution', () => {
    const expected = context(['not', ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
    candidate.utterances[0]!.asrTokens[0] = 'heard'
    candidate.utterances[0]!.discrepancies = [resolved(0, 0, 'not', 'heard')]; rebindEvidence(candidate, expected)
    expect(validate(candidate, expected)).toMatchObject({
      wordErrorRate: 0.01, criticalDiscrepancies: 1, unresolvedCriticalDiscrepancies: 0,
    })
    const unreferenced = structuredClone(candidate)
    unreferenced.utterances[0]!.discrepancies[0]!.resolution.listeningReference = ''
    expect(() => validate(unreferenced, expected)).toThrow()
    candidate.utterances[0]!.asrTokens[1] = 'wrong'
    candidate.utterances[0]!.discrepancies.push(resolved(1, 1, 'word', 'wrong')); rebindEvidence(candidate, expected)
    expect(() => validate(candidate, expected)).toThrow(/word error rate/i)
  })
  it('fails closed on unresolved names, numbers, negation and legal-standard words', () => {
    for (const critical of ['Mara', 'eleven', 'not', 'section', 'murder', 'burden', 'reasonable', 'doubt', 'intent', 'death', 'injury', 'duty', 'causation', 'unanimous', 'majority', 'agreement']) {
      const expected = context([critical, ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
      candidate.utterances[0]!.asrTokens[0] = 'other'; rebindEvidence(candidate, expected)
      expect(() => validate(candidate, expected)).toThrow(/unresolved critical/i)
    }
  })
  it('derives final-cast name criticality from the bound candidate, not the legacy registry', () => {
    const expected = context(['helen', ...Array(99).fill('word')].join(' ')); const candidate = receipt(expected)
    const omitted = structuredClone(expected); omitted.turns[0]!.displayLabel = ''; expect(() => validate(candidate, omitted)).toThrow(/reviewed actor identity/i)
    candidate.utterances[0]!.asrTokens[0] = 'other'; rebindEvidence(candidate, expected)
    expect(() => validate(candidate, expected)).toThrow(/unresolved critical.*helen/i)
  })
})
