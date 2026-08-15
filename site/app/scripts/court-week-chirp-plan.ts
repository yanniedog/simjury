import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  buildCourtWeekPerformanceManifest,
  CANONICAL_PERFORMANCE_IDENTITIES,
  type CourtWeekPerformanceManifest,
  validateCourtWeekPerformanceManifest,
} from './court-week-performance-manifest'
import { COURT_WEEK_REVIEW_ROLES } from './court-week-review-signoffs'
import {
  assessPronounceability,
  buildCourtWeekPronounceabilityAudit,
  type PronounceabilityDisposition,
  type PronounceabilityFinding,
} from './court-week-pronounceability'
import {
  buildCourtWeekSpeechReviewLedger,
  COURT_WEEK_SPEECH_CANDIDATES,
  type SpeechCandidateDay,
} from '../src/courtweek/content/speechReviewLedger'

export const CHIRP_REGISTRY_SCHEMA = 'simjury.google-chirp3-hd-registry/v1' as const
export const CHIRP_PLAN_SCHEMA = 'simjury.court-week-chirp3-plan/v1' as const
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS is required')
const googleSourceUrl = httpsUrl.refine((value) => {
  const host = new URL(value).hostname
  return host === 'cloud.google.com' || host === 'docs.cloud.google.com'
}, 'Official Google Cloud source URL is required')
const evidenceFields = {
  capturedAt: z.string().datetime({ offset: true }),
  sourceSha256: digestSchema,
}

export const chirpRegistrySchema = z.object({
  schema: z.literal(CHIRP_REGISTRY_SCHEMA),
  providerId: z.literal('google-chirp3-hd-en-au'),
  model: z.literal('Chirp 3: HD voices'),
  locale: z.literal('en-AU'),
  voiceSource: z.literal('provider-stock'),
  inventory: z.object({
    ...evidenceFields,
    sourceUrl: googleSourceUrl,
    voiceIds: z.array(z.string().min(1)).length(28),
  }).strict(),
  pricing: z.object({
    ...evidenceFields,
    sourceUrl: googleSourceUrl,
    billingCharacterUnit: z.enum(['unicode-code-points', 'utf-16-code-units']),
    usdMicrosPerMillionCharacters: z.number().int().positive(),
  }).strict(),
  audConversion: z.object({
    ...evidenceFields,
    sourceUrl: httpsUrl,
    audMicrosPerUsd: z.number().int().positive(),
  }).strict(),
  assignments: z.array(z.object({
    identityId: z.string().min(1),
    voiceId: z.string().min(1),
  }).strict()).length(28),
}).strict()

export type ChirpRegistry = z.infer<typeof chirpRegistrySchema>
type Projection = ReturnType<typeof buildCourtWeekPerformanceManifest>['pronunciationProjections'][number]

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}
const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const valueDigest = (value: unknown): string => sha256(canonicalJson(value))
const characterCount = (value: string, unit: ChirpRegistry['pricing']['billingCharacterUnit']): number =>
  unit === 'unicode-code-points' ? [...value].length : value.length

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function validateChirpRegistry(value: unknown): ChirpRegistry {
  const registry = chirpRegistrySchema.parse(value)
  const voiceIds = registry.inventory.voiceIds
  if (new Set(voiceIds).size !== 28) throw new Error('Closed Chirp registry requires 28 distinct voice ids')
  if (!same(voiceIds, [...voiceIds].sort())) throw new Error('Closed Chirp voice ids must use deterministic sorted order')
  const expectedIdentities = CANONICAL_PERFORMANCE_IDENTITIES.map(({ id }) => id)
  if (!same(registry.assignments.map(({ identityId }) => identityId), expectedIdentities)) {
    throw new Error('Chirp assignments must contain the canonical 28 identities in governance order')
  }
  const assignedVoices = registry.assignments.map(({ voiceId }) => voiceId)
  if (new Set(assignedVoices).size !== 28) throw new Error('Chirp roles may not share a stock voice')
  const unknown = assignedVoices.filter((voiceId) => !voiceIds.includes(voiceId))
  if (unknown.length) throw new Error(`Chirp assignment names unknown voices: ${unknown.join(', ')}`)
  if (!same([...assignedVoices].sort(), [...voiceIds].sort())) throw new Error('Every closed-registry voice must be assigned once')
  return registry
}

interface ProjectionTrace {
  projectionId: string
  findingId: string
  canonicalTextSha256: string
  status: Projection['status']
  canonical: string
  spoken: string
  canonicalStart: number
  canonicalEnd: number
  tokenStart: number
  tokenEndExclusive: number
}

type ReviewedProjection = {
  definition: Projection
  disposition: PronounceabilityDisposition
  finding: PronounceabilityFinding
}

function projectPronunciation(text: string, projections: readonly ReviewedProjection[]): {
  pronunciationText: string
  traces: ProjectionTrace[]
} {
  const traces = projections.map(({ definition, disposition, finding }) => {
    const canonicalStart = finding.utf16Start
    const canonicalEnd = finding.utf16EndExclusive
    if (sha256(text) !== finding.canonicalTextSha256
      || text.slice(canonicalStart, canonicalEnd) !== finding.canonical) {
      throw new Error(`${finding.id}: reviewed pronunciation occurrence is stale`)
    }
    return {
      ...definition,
      projectionId: definition.id,
      findingId: finding.id,
      canonicalTextSha256: finding.canonicalTextSha256,
      spoken: disposition.spoken!,
      canonicalStart,
      canonicalEnd,
      tokenStart: finding.tokenStart,
      tokenEndExclusive: finding.tokenEndExclusive,
    }
  }).sort((left, right) => left.canonicalStart - right.canonicalStart)
  for (let index = 1; index < traces.length; index += 1) {
    if (traces[index]!.canonicalStart < traces[index - 1]!.canonicalEnd) throw new Error('Pronunciation projections overlap')
  }
  let pronunciationText = text
  for (const trace of [...traces].reverse()) {
    pronunciationText = pronunciationText.slice(0, trace.canonicalStart)
      + trace.spoken + pronunciationText.slice(trace.canonicalEnd)
  }
  return { pronunciationText, traces }
}

export function buildCourtWeekChirpPlan(
  registryInput: unknown,
  days: readonly SpeechCandidateDay[] = COURT_WEEK_SPEECH_CANDIDATES,
  review: {
    dispositions?: readonly PronounceabilityDisposition[]
    performanceManifest?: CourtWeekPerformanceManifest
  } = {},
) {
  const registry = validateChirpRegistry(registryInput)
  const governance = review.performanceManifest
    ? validateCourtWeekPerformanceManifest(review.performanceManifest)
    : buildCourtWeekPerformanceManifest()
  const ledger = buildCourtWeekSpeechReviewLedger(days)
  const pronounceability = buildCourtWeekPronounceabilityAudit(ledger.rows)
  const dispositions = [...(review.dispositions ?? [])]
    .sort((left, right) => left.findingId.localeCompare(right.findingId))
  const pronunciationAssessment = assessPronounceability(pronounceability.findings, dispositions)
  const dispositionByFinding = new Map(dispositions.map((entry) => [entry.findingId, entry]))
  const approvedProjections = governance.pronunciationProjections.filter(({ status }) => status === 'approved')
  const reviewedProjections = pronounceability.findings.flatMap((finding): ReviewedProjection[] => {
    const disposition = dispositionByFinding.get(finding.id)
    if (disposition?.status !== 'approved' || disposition.action !== 'provider-projection') return []
    const definition = approvedProjections.find((projection) =>
      projection.canonical === finding.canonical && projection.spoken === disposition.spoken)
    if (!definition) throw new Error(`${finding.id}: provider projection is not approved by the performance manifest`)
    if (!finding.turnId) throw new Error(`${finding.id}: provider projection lacks an exact turn occurrence`)
    return [{ definition, disposition, finding }]
  })
  const projectionsByTurn = new Map<string, ReviewedProjection[]>()
  for (const projection of reviewedProjections) {
    const turnId = projection.finding.turnId!
    projectionsByTurn.set(turnId, [...(projectionsByTurn.get(turnId) ?? []), projection])
  }
  const identityByLabel = new Map<string, string>()
  for (const identity of governance.identities) for (const label of identity.speakerLabels) {
    if (identityByLabel.has(label)) throw new Error(`Governance speaker label is shared: ${label}`)
    identityByLabel.set(label, identity.id)
  }
  const assignmentByIdentity = new Map(registry.assignments.map((assignment) => [assignment.identityId, assignment]))
  const identityByActor = new Map<string, string>()
  const actorByIdentity = new Map<string, string>()
  const jobs = ledger.rows.map((row) => {
    const identityId = identityByLabel.get(row.displayLabel)
    if (!identityId) throw new Error(`${row.turnId}: display label lacks a governed performance identity`)
    const assignment = assignmentByIdentity.get(identityId)
    if (!assignment) throw new Error(`${row.turnId}: performance identity lacks a Chirp assignment`)
    const priorIdentity = identityByActor.get(row.actorId)
    const priorActor = actorByIdentity.get(identityId)
    if ((priorIdentity && priorIdentity !== identityId) || (priorActor && priorActor !== row.actorId)) {
      throw new Error(`${row.turnId}: actor and performance identity are not one-to-one`)
    }
    identityByActor.set(row.actorId, identityId)
    actorByIdentity.set(identityId, row.actorId)
    const { pronunciationText, traces } = projectPronunciation(
      row.text, projectionsByTurn.get(row.turnId) ?? [],
    )
    return {
      jobId: row.turnId, day: row.day, cueId: row.cueId, sourceCueIds: row.sourceCueIds,
      captionIds: row.captionIds, variant: row.variant, actorId: row.actorId, identityId,
      displayLabel: row.displayLabel, speechMode: row.speechMode, legalAction: row.legalAction,
      canonicalText: row.text, canonicalTextSha256: sha256(row.text),
      pronunciationText, pronunciationTextSha256: sha256(pronunciationText), pronunciationProjections: traces,
      requestMetadata: {
        providerId: registry.providerId, model: registry.model, locale: registry.locale,
        voiceId: assignment.voiceId,
        characterCount: characterCount(pronunciationText, registry.pricing.billingCharacterUnit),
      },
    }
  })
  if (identityByActor.size !== 28 || actorByIdentity.size !== 28) throw new Error('Explicit turns must exercise all 28 governed identities')
  const canonicalCharacters = jobs.reduce((total, job) =>
    total + characterCount(job.canonicalText, registry.pricing.billingCharacterUnit), 0)
  const providerCharacters = jobs.reduce((total, job) => total + job.requestMetadata.characterCount, 0)
  if (providerCharacters > governance.computePolicy.maximumProviderCharacters) throw new Error('Chirp plan exceeds the provider character ceiling')
  const estimatedUsdMicros = Math.ceil(providerCharacters * registry.pricing.usdMicrosPerMillionCharacters / 1_000_000)
  const estimatedAudMicros = Math.ceil(estimatedUsdMicros * registry.audConversion.audMicrosPerUsd / 1_000_000)
  const maxAudMicros = governance.computePolicy.maxIncrementalSpendAud * 1_000_000
  if (estimatedAudMicros > maxAudMicros) throw new Error('Chirp plan exceeds the AUD 50 incremental-spend ceiling')
  const voiceTotals = registry.assignments.map(({ identityId, voiceId }) => {
    const assignedJobs = jobs.filter((job) => job.identityId === identityId)
    return {
      identityId, voiceId, jobCount: assignedJobs.length,
      characters: assignedJobs.reduce((total, job) => total + job.requestMetadata.characterCount, 0),
    }
  })
  const payload = {
    schema: CHIRP_PLAN_SCHEMA, caseId: 'cw-0001' as const,
    sourceRevision: governance.sourceRevision,
    forensicLedgerDigest: sha256(JSON.stringify(ledger)),
    governanceDigest: governance.governanceDigest,
    registryDigest: valueDigest(registry),
    policy: {
      offlinePlanOnly: true, stockVoicesOnly: true, donorRecordingsRequired: false,
      runtimeInferenceAllowed: false, cloudflareRuntimeAllowed: false, recurringSpendAud: 0,
    },
    characterTotals: { billingUnit: registry.pricing.billingCharacterUnit, canonicalCharacters, providerCharacters },
    costEstimate: {
      billingCurrency: 'USD' as const,
      usdMicrosPerMillionCharacters: registry.pricing.usdMicrosPerMillionCharacters,
      audMicrosPerUsd: registry.audConversion.audMicrosPerUsd,
      freeTierCharactersApplied: 0, estimatedUsdMicros, estimatedAudMicros,
      maxAudMicros, withinBudget: true as const,
    },
    voiceTotals,
    pronounceabilityReview: {
      auditDigest: pronounceability.auditDigest, coverage: pronounceability.coverage,
      dispositionDigest: valueDigest(dispositions),
      counts: pronounceability.counts,
      affectedActorCount: pronounceability.impact.actorIds.length,
      affectedTurnCount: pronounceability.impact.turnIds.length,
      approvedFindingCount: pronounceability.findings.length - pronunciationAssessment.unresolvedFindingIds.length,
      unresolvedFindingCount: pronunciationAssessment.unresolvedFindingIds.length,
    },
    generationGate: {
      allowed: false as const,
      blockers: [
        ...COURT_WEEK_REVIEW_ROLES.map((role) => `human-signoff:${role}`),
        ...(pronunciationAssessment.unresolvedFindingIds.length
          ? [`pronounceability-review:${pronunciationAssessment.unresolvedFindingIds.length}-unresolved`] : []),
        'perceptual-distinctness-review', 'atomic-content-media-cutover',
        'approved-pronunciation-projections', 'approved-performance-manifest',
      ],
    },
    jobs,
  }
  return { ...payload, planDigest: valueDigest(payload) }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const blockedOutputRoots = [resolve(scriptDirectory, '../public'), resolve(scriptDirectory, '../../public')]
const isWithin = (root: string, target: string): boolean => {
  const [rootKey, targetKey] = [root, target].map((value) => value.toLocaleLowerCase('en-US'))
  return targetKey === rootKey || targetKey.startsWith(rootKey + sep)
}

export function writeCourtWeekChirpPlan(registryPath: string, outputPath: string): void {
  const output = resolve(outputPath)
  if (blockedOutputRoots.some((root) => isWithin(root, output))) throw new Error('Chirp plans must not enter a runtime or Cloudflare asset path')
  const registry = JSON.parse(readFileSync(resolve(registryPath), 'utf8'))
  const plan = buildCourtWeekChirpPlan(registry)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`)
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? undefined : process.argv[index + 1]
  if (!value || value.startsWith('-')) throw new Error(`${name} is required`)
  return value
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  writeCourtWeekChirpPlan(requiredArgument('--registry'), requiredArgument('--output'))
}
