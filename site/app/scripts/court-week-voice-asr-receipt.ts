import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
export const VOICE_ASR_RECEIPT_SCHEMA = 'simjury.court-week-voice-asr-receipt/v1' as const
const RAW_ASR_SCHEMA = 'simjury.court-week-raw-asr/v1' as const
const RAW_ALIGNMENT_SCHEMA = 'simjury.court-week-raw-alignment/v1' as const
export const WHISPER_ASR_TOOLCHAIN = {
  engine: 'openai-whisper', repository: 'https://github.com/openai/whisper',
  revision: '31243bad24cc746f07d4c8bfdd2d974872cb1803', model: 'large-v3',
  weightsSha256: 'sha256:e5b1a55b89c1367dacf97e3e19bfd829a01529dbfdeefa8caeb59b3f1b81dadb',
  asrMode: 'offline-independent-transcription',
  alignmentMode: 'canonical-transcript-word-dtw',
  networkInference: false,
} as const
export const VOICE_ASR_THRESHOLDS = {
  medianBoundaryErrorMs: 100, p95BoundaryErrorMs: 250, maximumWordErrorRate: 0.01,
} as const
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const artifactSchema = z.object({ path: z.string().min(1), sha256: digestSchema }).strict()
const bindingsSchema = z.object({
  candidateDigest: digestSchema, sourceDigest: digestSchema,
  performanceDigest: digestSchema, activationProjectionDigest: digestSchema, mediaDigest: digestSchema,
}).strict()
const toolchainSchema = z.object({
  engine: z.literal(WHISPER_ASR_TOOLCHAIN.engine),
  repository: z.literal(WHISPER_ASR_TOOLCHAIN.repository),
  revision: z.literal(WHISPER_ASR_TOOLCHAIN.revision),
  model: z.literal(WHISPER_ASR_TOOLCHAIN.model),
  weightsSha256: z.literal(WHISPER_ASR_TOOLCHAIN.weightsSha256),
  asrMode: z.literal(WHISPER_ASR_TOOLCHAIN.asrMode),
  alignmentMode: z.literal(WHISPER_ASR_TOOLCHAIN.alignmentMode),
  networkInference: z.literal(false),
}).strict()
const runSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u),
  runnerRevision: z.string().regex(/^[0-9a-f]{40}$/u),
  invocationSha256: digestSchema,
}).strict()
const validatedRunSchema = runSchema.extend({
  rawAsrSha256: digestSchema, rawAlignmentSha256: digestSchema,
}).strict()
const rawProvenanceSchema = z.object({
  run: runSchema, toolchain: toolchainSchema, bindings: bindingsSchema,
}).strict()
const resolutionSchema = z.object({
  disposition: z.literal('asr-only'),
  listeningReference: z.string().regex(/^listen:[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
}).strict()
const discrepancySchema = z.object({
  kind: z.enum(['substitution', 'deletion', 'insertion']),
  canonicalIndex: z.number().int().nonnegative().nullable(),
  asrIndex: z.number().int().nonnegative().nullable(),
  canonical: z.string().min(1).nullable(), asr: z.string().min(1).nullable(),
  resolution: resolutionSchema,
}).strict()
export const voiceAsrReceiptSchema = z.object({
  schema: z.literal(VOICE_ASR_RECEIPT_SCHEMA), caseId: z.literal('cw-0001'),
  revision: z.string().min(1),
  bindings: bindingsSchema,
  evidence: z.object({ run: runSchema, rawAsr: artifactSchema, rawAlignment: artifactSchema }).strict(),
  toolchain: toolchainSchema,
  thresholds: z.object({
    medianBoundaryErrorMs: z.literal(100), p95BoundaryErrorMs: z.literal(250),
    maximumWordErrorRate: z.literal(0.01),
  }).strict(),
  utterances: z.array(z.object({
    turnId: z.string().min(1), canonicalTextSha256: digestSchema, mediaSha256: digestSchema,
    durationMs: z.number().finite().positive(), asrTokens: z.array(z.string().min(1)),
    alignment: z.array(z.object({
      canonicalIndex: z.number().int().nonnegative(), canonical: z.string().min(1),
      observedStartMs: z.number().finite().nonnegative(), observedEndMs: z.number().finite().positive(),
      referenceStartMs: z.number().finite().nonnegative(), referenceEndMs: z.number().finite().positive(),
    }).strict()),
    discrepancies: z.array(discrepancySchema),
  }).strict()),
}).strict()
const rawAsrSchema = z.object({ schema: z.literal(RAW_ASR_SCHEMA), provenance: rawProvenanceSchema,
  utterances: z.array(z.object({
  turnId: z.string().min(1), mediaSha256: digestSchema, durationMs: z.number().finite().positive(), tokens: z.array(z.string().min(1)),
}).strict()) }).strict()
const rawAlignmentSchema = z.object({ schema: z.literal(RAW_ALIGNMENT_SCHEMA), provenance: rawProvenanceSchema,
  utterances: z.array(z.object({
  turnId: z.string().min(1), mediaSha256: digestSchema, durationMs: z.number().finite().positive(), words: z.array(z.object({ canonicalIndex: z.number().int().nonnegative(),
    canonical: z.string().min(1),
    observedStartMs: z.number().finite().nonnegative(), observedEndMs: z.number().finite().positive(),
  }).strict()),
}).strict()) }).strict()
export type VoiceAsrReceipt = z.infer<typeof voiceAsrReceiptSchema>
export type VoiceAsrEvidenceResolver = (absolutePath: string) => Uint8Array
export interface VoiceAsrContext {
  caseId: 'cw-0001'; revision: string; sourceContract: 'explicit-candidate'; candidateDigest: string; sourceDigest: string
  /** Produced by the separately validated candidate-media step; never copied from the ASR receipt. */
  performanceDigest: string; activationProjectionDigest: string; mediaContract: 'validated-candidate-media'; mediaDigest: string
  validatedRun: z.infer<typeof validatedRunSchema>
  turns: readonly { turnId: string; actorId: string; displayLabel: string; text: string; mediaSha256: string; durationMs: number
    referenceBoundaries: readonly { startMs: number; endMs: number }[] }[]
}
type Word = { raw: string; normalized: string }
type Discrepancy = Omit<VoiceAsrReceipt['utterances'][number]['discrepancies'][number], 'resolution'>
const sha256 = (value: string | Uint8Array): string => `sha256:${createHash('sha256').update(value).digest('hex')}`
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
const normalize = (word: string): string => word.toLocaleLowerCase('en-AU').replace(/’/gu, "'")
export const canonicalWords = (text: string): Word[] =>
  [...text.matchAll(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)]
    .map(([raw]) => ({ raw, normalized: normalize(raw) }))
export function courtWeekVoiceMediaDigest(utterances: readonly Pick<
VoiceAsrReceipt['utterances'][number], 'turnId' | 'mediaSha256' | 'durationMs'>[]): string {
  return sha256(canonicalJson(utterances.map(({ turnId, mediaSha256, durationMs }) => ({ turnId, mediaSha256, durationMs }))))
}
export const courtWeekVoiceActivationProjectionDigest = (context: VoiceAsrContext): string => sha256(canonicalJson((({
  caseId, revision, candidateDigest, sourceDigest, performanceDigest, mediaContract, turns }) =>
  ({ caseId, revision, candidateDigest, sourceDigest, performanceDigest, mediaContract, turns }))(context)))
function editScript(canonical: readonly Word[], asr: readonly Word[]): Discrepancy[] {
  const costs = Array.from({ length: canonical.length + 1 }, (_, left) =>
    Array.from({ length: asr.length + 1 }, (_, right) => left === 0 ? right : right === 0 ? left : 0))
  for (let left = 1; left <= canonical.length; left += 1) for (let right = 1; right <= asr.length; right += 1) {
    costs[left]![right] = canonical[left - 1]!.normalized === asr[right - 1]!.normalized
      ? costs[left - 1]![right - 1]!
      : 1 + Math.min(costs[left - 1]![right - 1]!, costs[left - 1]![right]!, costs[left]![right - 1]!)
  }
  const edits: Discrepancy[] = []
  let left = canonical.length; let right = asr.length
  while (left || right) {
    if (left && right && canonical[left - 1]!.normalized === asr[right - 1]!.normalized) { left -= 1; right -= 1; continue }
    const cost = costs[left]![right]!
    if (left && right && costs[left - 1]![right - 1]! + 1 === cost) {
      edits.push({ kind: 'substitution', canonicalIndex: --left, asrIndex: --right,
        canonical: canonical[left]!.raw, asr: asr[right]!.raw })
    } else if (left && costs[left - 1]![right]! + 1 === cost) {
      edits.push({ kind: 'deletion', canonicalIndex: --left, asrIndex: null,
        canonical: canonical[left]!.raw, asr: null })
    } else {
      edits.push({ kind: 'insertion', canonicalIndex: null, asrIndex: --right,
        canonical: null, asr: asr[right]!.raw })
    }
  }
  return edits.reverse()
}
const numberWords = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth'.split(' '))
const legalCritical = new Set('no not never neither nor cannot unable without section statute murder manslaughter guilty verdict burden proof prove proved proving beyond reasonable doubt standard intent intention death serious injury duty causation unanimous majority agreement'.split(' '))
function isCritical(edit: Discrepancy, actorNameWords: ReadonlySet<string>): boolean {
  return [edit.canonical, edit.asr].filter((word): word is string => Boolean(word)).some((raw) => {
    const normalized = normalize(raw)
    return actorNameWords.has(normalized) || legalCritical.has(normalized)
      || /\p{N}/u.test(normalized)
      || normalized.split('-').some((part) => numberWords.has(part) || legalCritical.has(part))
      || /^\p{Lu}/u.test(raw)
  })
}
const percentile = (sorted: readonly number[], ratio: number): number =>
  sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]!
const median = (sorted: readonly number[]): number => sorted.length % 2
  ? sorted[(sorted.length - 1) / 2]!
  : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
function assertAlignmentThresholds(errors: readonly number[], label: string) {
  if (!errors.length) throw new Error(`${label}: no aligned canonical words`)
  const sorted = [...errors].sort((left, right) => left - right)
  const medianMs = median(sorted); const p95Ms = percentile(sorted, 0.95)
  if (medianMs > VOICE_ASR_THRESHOLDS.medianBoundaryErrorMs) throw new Error(`${label}: median alignment error ${medianMs}ms exceeds 100ms`)
  if (p95Ms > VOICE_ASR_THRESHOLDS.p95BoundaryErrorMs) throw new Error(`${label}: P95 alignment error ${p95Ms}ms exceeds 250ms`)
  return { medianMs, p95Ms }
}
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right)
function loadEvidence(artifact: VoiceAsrReceipt['evidence']['rawAsr'], resolver: VoiceAsrEvidenceResolver): unknown {
  const target = assertVoiceAsrReceiptPath(artifact.path)
  if (!basename(target).includes(artifact.sha256.slice(7))) throw new Error('ASR evidence path is not content-addressed')
  const bytes = resolver(target)
  if (!(bytes instanceof Uint8Array) || sha256(bytes) !== artifact.sha256) {
    throw new Error('ASR evidence bytes do not match their bound SHA-256')
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
}
export function validateVoiceAsrReceipt(
  value: unknown, expected: VoiceAsrContext, resolveEvidence: VoiceAsrEvidenceResolver,
) {
  const receipt = voiceAsrReceiptSchema.parse(value)
  if (expected.sourceContract !== 'explicit-candidate') throw new Error('ASR receipt requires an explicit-candidate activation context')
  if (expected.mediaContract !== 'validated-candidate-media'
    || expected.mediaDigest !== courtWeekVoiceMediaDigest(expected.turns)) throw new Error('ASR receipt requires a validated candidate media projection')
  const validatedRun = validatedRunSchema.parse(expected.validatedRun)
  const identities = new Map<string, Set<string>>(); const actorNameWords = new Set<string>()
  for (const turn of expected.turns) {
    const labelWords = typeof turn.displayLabel === 'string' ? canonicalWords(turn.displayLabel) : []
    if (typeof turn.actorId !== 'string' || !turn.actorId || !labelWords.length) throw new Error(`${turn.turnId}: missing reviewed actor identity`)
    const labels = identities.get(turn.actorId) ?? new Set<string>(); labels.add(turn.displayLabel); identities.set(turn.actorId, labels); labelWords.forEach(({ normalized }) => actorNameWords.add(normalized))
  }
  if (expected.activationProjectionDigest !== courtWeekVoiceActivationProjectionDigest(expected)) throw new Error('Explicit-candidate activation projection digest is stale')
  const expectedBindings = (({ candidateDigest, sourceDigest, performanceDigest, activationProjectionDigest, mediaDigest }) => ({ candidateDigest, sourceDigest, performanceDigest, activationProjectionDigest, mediaDigest }))(expected)
  if (receipt.caseId !== expected.caseId || receipt.revision !== expected.revision
    || !same(receipt.bindings, expectedBindings)) throw new Error('Voice ASR receipt targets stale case or digest bindings')
  if (courtWeekVoiceMediaDigest(receipt.utterances) !== receipt.bindings.mediaDigest) throw new Error('Voice ASR receipt media digest does not match its ordered audio hashes and durations')
  if (receipt.evidence.rawAsr.path === receipt.evidence.rawAlignment.path) throw new Error('Raw ASR and raw alignment evidence must be separate artifacts')
  const expectedRun = { id: validatedRun.id, runnerRevision: validatedRun.runnerRevision,
    invocationSha256: validatedRun.invocationSha256 }
  if (!same(receipt.evidence.run, expectedRun)
    || receipt.evidence.rawAsr.sha256 !== validatedRun.rawAsrSha256
    || receipt.evidence.rawAlignment.sha256 !== validatedRun.rawAlignmentSha256) {
    throw new Error('ASR evidence does not match the separately validated toolchain run')
  }
  const rawAsr = rawAsrSchema.parse(loadEvidence(receipt.evidence.rawAsr, resolveEvidence))
  const rawAlignment = rawAlignmentSchema.parse(loadEvidence(receipt.evidence.rawAlignment, resolveEvidence))
  const expectedProvenance = { run: receipt.evidence.run, toolchain: receipt.toolchain, bindings: receipt.bindings }
  if (!same(rawAsr.provenance, expectedProvenance) || !same(rawAlignment.provenance, expectedProvenance)) {
    throw new Error('Raw ASR or alignment evidence lacks the bound run and toolchain provenance')
  }
  const evidenceIdentity = (utterances: readonly { turnId: string; mediaSha256: string; durationMs: number }[]) =>
    utterances.map(({ turnId, mediaSha256, durationMs }) => ({ turnId, mediaSha256, durationMs }))
  if (!same(evidenceIdentity(rawAsr.utterances), evidenceIdentity(receipt.utterances))
    || !same(evidenceIdentity(rawAlignment.utterances), evidenceIdentity(receipt.utterances))) throw new Error('Raw ASR or alignment evidence targets different turns or media')
  if (!same(receipt.utterances.map(({ turnId }) => turnId), expected.turns.map(({ turnId }) => turnId))) throw new Error('Voice ASR receipt must cover every canonical turn exactly once and in order')
  const boundaryErrors: number[] = []
  let canonicalCount = 0; let editCount = 0; let criticalCount = 0
  for (const [utteranceIndex, utterance] of receipt.utterances.entries()) {
    const source = expected.turns[utteranceIndex]!
    const rawAsrTurn = rawAsr.utterances[utteranceIndex]!
    const rawAlignmentTurn = rawAlignment.utterances[utteranceIndex]!
    if (utterance.canonicalTextSha256 !== sha256(source.text)) throw new Error(`${source.turnId}: canonical text digest is stale`)
    if (utterance.mediaSha256 !== source.mediaSha256 || utterance.durationMs !== source.durationMs) {
      throw new Error(`${source.turnId}: audio hash or duration differs from the validated media projection`)
    }
    if (!same(rawAsrTurn.tokens, utterance.asrTokens)
      || !same(rawAlignmentTurn.words, utterance.alignment.map((word) => (({
        canonicalIndex, canonical, observedStartMs, observedEndMs,
      }) => ({ canonicalIndex, canonical, observedStartMs, observedEndMs }))(word)))) {
      throw new Error(`${source.turnId}: receipt projection differs from raw ASR or alignment evidence`)
    }
    const words = canonicalWords(source.text)
    const asr = utterance.asrTokens.map((token) => {
      const parsed = canonicalWords(token)
      if (parsed.length !== 1) throw new Error(`${source.turnId}: ASR entries must each contain one word token`)
      return parsed[0]!
    })
    if (utterance.alignment.length !== words.length) throw new Error(`${source.turnId}: forced alignment omitted or invented canonical words`)
    if (source.referenceBoundaries.length !== words.length) throw new Error(`${source.turnId}: activation projection lacks canonical word boundaries`)
    let previousObservedEnd = 0; let previousReferenceEnd = 0; const utteranceBoundaryErrors: number[] = []
    for (const [index, aligned] of utterance.alignment.entries()) {
      if (aligned.canonicalIndex !== index || aligned.canonical !== words[index]!.raw) {
        throw new Error(`${source.turnId}: forced alignment duplicated, reordered or invented a canonical word`)
      }
      const reference = source.referenceBoundaries[index]!
      if (aligned.referenceStartMs !== reference.startMs || aligned.referenceEndMs !== reference.endMs) {
        throw new Error(`${source.turnId}: caption reference boundary is stale`)
      }
      if (aligned.observedStartMs < previousObservedEnd || aligned.observedEndMs <= aligned.observedStartMs
        || aligned.referenceStartMs < previousReferenceEnd || aligned.referenceEndMs <= aligned.referenceStartMs
        || aligned.observedEndMs > utterance.durationMs || aligned.referenceEndMs > utterance.durationMs) {
        throw new Error(`${source.turnId}: forced word alignment is not monotonic and in range`)
      }
      previousObservedEnd = aligned.observedEndMs; previousReferenceEnd = aligned.referenceEndMs
      const boundaryError = Math.max(Math.abs(aligned.observedStartMs - aligned.referenceStartMs),
        Math.abs(aligned.observedEndMs - aligned.referenceEndMs))
      boundaryErrors.push(boundaryError); utteranceBoundaryErrors.push(boundaryError)
    }
    assertAlignmentThresholds(utteranceBoundaryErrors, source.turnId)
    const edits = editScript(words, asr)
    const recorded = utterance.discrepancies.map(({ kind, canonicalIndex, asrIndex, canonical, asr }) =>
      ({ kind, canonicalIndex, asrIndex, canonical, asr }))
    if (!same(recorded, edits)) {
      const critical = edits.filter((edit) => isCritical(edit, actorNameWords))
      throw new Error(critical.length
        ? `${source.turnId}: unresolved critical ASR discrepancy (${critical.map(({ canonical, asr: heard }) => canonical ?? heard).join(', ')})`
        : `${source.turnId}: ASR discrepancy ledger is missing, duplicate or stale`)
    }
    canonicalCount += words.length; editCount += edits.length
    criticalCount += edits.filter((edit) => isCritical(edit, actorNameWords)).length
  }
  if (!boundaryErrors.length || !canonicalCount) throw new Error('Voice ASR receipt contains no aligned canonical words')
  const { medianMs, p95Ms } = assertAlignmentThresholds(boundaryErrors, 'Corpus')
  const wordErrorRate = editCount / canonicalCount
  if (wordErrorRate > VOICE_ASR_THRESHOLDS.maximumWordErrorRate) throw new Error(`Word error rate ${wordErrorRate} exceeds 1%`)
  return { verified: true as const, canonicalWords: canonicalCount, discrepancies: editCount,
    criticalDiscrepancies: criticalCount, unresolvedCriticalDiscrepancies: 0 as const,
    medianBoundaryErrorMs: medianMs, p95BoundaryErrorMs: p95Ms, wordErrorRate }
}
const scriptDirectory = dirname(fileURLToPath(import.meta.url)); const appRoot = resolve(scriptDirectory, '..')
const reviewRoot = resolve(appRoot, 'content-reviews'); const isWithin = (root: string, target: string): boolean => target === root || target.startsWith(root + sep)
export function assertVoiceAsrReceiptPath(path: string): string {
  if (isAbsolute(path)) throw new Error('Voice ASR evidence paths must be repository-relative')
  const target = resolve(appRoot, path)
  if (!isWithin(reviewRoot, target)) {
    throw new Error('Voice ASR receipts and evidence must remain in the review-only content-reviews path')
  }
  const realReviewRoot = realpathSync.native(reviewRoot); const realTarget = realpathSync.native(target)
  if (!isWithin(realReviewRoot, realTarget) || isAbsolute(relative(realReviewRoot, realTarget))) {
    throw new Error('Voice ASR evidence resolved outside the review-only content-reviews path')
  }
  return realTarget
}
export function runVoiceAsrReceiptCli(): never {
  throw new Error('Voice ASR receipt CLI is blocked until a separately validated explicit-candidate performance/media projection and trusted generator run provide exact audio and caption-boundary bindings')
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runVoiceAsrReceiptCli()
}
