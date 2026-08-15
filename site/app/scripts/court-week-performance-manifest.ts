import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { splitCueTurns } from '../src/courtweek/content/cueTurns'
import type { CourtWeek } from '../src/courtweek/model/schema'
import { GOOGLE_CHIRP3_INVENTORY_DIGEST, GOOGLE_CHIRP3_SOURCE } from './court-week-chirp-source'
export const PERFORMANCE_MANIFEST_SCHEMA = 'simjury.court-week-performance/v2' as const
export const PERFORMANCE_PROVIDER_ID = 'google-chirp3-hd-en-au' as const
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS is required')

const providerSchema = z.object({
  id: z.literal(PERFORMANCE_PROVIDER_ID),
  label: z.string().min(1),
  delivery: z.literal('managed-batch-api'),
  configuration: z.string().min(1),
  serviceModel: z.string().min(1),
  documentationUrl: httpsUrl,
  pricingUrl: httpsUrl,
  voiceInventory: z.object({
    locale: z.literal('en-AU'), count: z.number().int().min(28),
    status: z.enum(['pending', 'verified']), inventorySha256: digestSchema.nullable(),
  }).strict().superRefine((inventory, context) => {
    if ((inventory.status === 'verified') !== (inventory.inventorySha256 !== null)) {
      context.addIssue({ code: 'custom', message: 'Verified voice inventory requires its digest' })
    }
  }),
}).strict()

const assignmentSchema = z.object({
  providerId: z.literal(PERFORMANCE_PROVIDER_ID),
  voiceProfileId: z.string().regex(/^en-AU-Chirp3-HD-[A-Za-z]+$/u),
  source: z.literal('provider-stock'),
}).strict()

const identitySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  speakerLabels: z.array(z.string().min(1)).min(1),
  castingBrief: z.string().min(12),
  assignment: assignmentSchema.nullable(),
}).strict()

const projectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  canonical: z.string().min(1),
  spoken: z.string().min(1),
  status: z.enum(['proposed', 'approved']),
}).strict().refine((value) => value.canonical !== value.spoken, 'Projection must change pronunciation text')

export const performanceManifestSchema = z.object({
  schema: z.literal(PERFORMANCE_MANIFEST_SCHEMA),
  stage: z.enum(['casting', 'approved']),
  sourceContract: z.enum(['legacy-inferred', 'explicit-reviewed']),
  caseId: z.literal('cw-0001'),
  sourceRevision: z.string().min(1),
  sourceDigest: digestSchema,
  performanceDigest: digestSchema,
  governanceDigest: digestSchema,
  computePolicy: z.object({
    maxIncrementalSpendAud: z.literal(50), recurringSpendAud: z.literal(0), managedBatchApisAllowed: z.literal(true),
    runtimeInferenceAllowed: z.literal(false), cloudflareRuntimeAllowed: z.literal(false),
    manualRunApprovalRequired: z.literal(true), maximumProviderCharacters: z.literal(1_000_000),
    stockVoicesOnly: z.literal(true), referenceAudioAllowed: z.literal(false),
    resumableUnit: z.literal('utterance'),
  }).strict(),
  providers: z.tuple([providerSchema]),
  identities: z.array(identitySchema).length(28),
  pronunciationProjections: z.array(projectionSchema),
}).strict()

export type CourtWeekPerformanceManifest = z.infer<typeof performanceManifestSchema>
type PerformancePayload = Omit<CourtWeekPerformanceManifest, 'performanceDigest' | 'governanceDigest'>

export const CANONICAL_PERFORMANCE_IDENTITIES = [
  { id: 'ari-tem', speakerLabels: ['Ari Tem'], castingBrief: 'Analytical, clipped and grounded without sounding robotic.' },
  { id: 'bram-tey', speakerLabels: ['Bram Tey'], castingBrief: 'Thoughtful, design-literate and conversationally restrained.' },
  // Legacy labels are migration-only; remove them at the explicit-source/media cutover.
  { id: 'clerk', speakerLabels: ['Judge’s Associate', 'Clerk'], castingBrief: 'Crisp formal procedure with exceptional intelligibility.' },
  { id: 'court-officer', speakerLabels: ['Court Attendant', 'Court officer'], castingBrief: 'Warm procedural authority, distinct from the associate and judge.' },
  { id: 'asha-renn', speakerLabels: ['Crown counsel Asha Renn'], castingBrief: 'Precise confidence and controlled urgency without aggression.' },
  { id: 'daro-sen', speakerLabels: ['Daro Sen'], castingBrief: 'Grounded, methodical reconstruction of sequence and time.' },
  { id: 'corin-dax', speakerLabels: ['Defence counsel Corin Dax'], castingBrief: 'Agile measured scepticism with understated authority.' },
  { id: 'eren-vos', speakerLabels: ['Dr Eren Vos'], castingBrief: 'Calm clinical authority with humane restraint.' },
  { id: 'edda-rook', speakerLabels: ['Edda Rook', 'Foreperson Edda Rook'], castingBrief: 'Inclusive room leadership, composed and non-coercive.' },
  { id: 'ilan-saye', speakerLabels: ['Ilan Saye'], castingBrief: 'Ordinary adult under credible urgency, never melodramatic.' },
  { id: 'jaro-pell', speakerLabels: ['Jaro Pell'], castingBrief: 'Seasoned operational clarity and practical confidence.' },
  { id: 'judge-sel-aven', speakerLabels: ['Judge Sel Aven', 'Judge’s neutral case note'], castingBrief: 'Mature low-variance authority without theatrical gravitas.' },
  { id: 'kessa-noor', speakerLabels: ['Kessa Noor'], castingBrief: 'Careful mediating cadence, firm but non-confrontational.' },
  { id: 'lina-fei', speakerLabels: ['Lina Fei'], castingBrief: 'Patient nuance while holding competing propositions.' },
  { id: 'mara-venn', speakerLabels: ['Mara Venn'], castingBrief: 'Restrained and guarded, with no editorial implication of guilt.' },
  { id: 'narrator', speakerLabels: ['Narrator'], castingBrief: 'Unobtrusive neutral Australian delivery, separate from court roles.' },
  { id: 'nella-orr', speakerLabels: ['Nella Orr'], castingBrief: 'Assured operations supervisor, factual and economical.' },
  { id: 'niko-hale', speakerLabels: ['Niko Hale'], castingBrief: 'Practical scepticism and careful causation reasoning.' },
  { id: 'omri-cade', speakerLabels: ['Omri Cade'], castingBrief: 'Patient teacherly cadence, reflective and fair-minded.' },
  { id: 'oren-vale', speakerLabels: ['Oren Vale'], castingBrief: 'Corporate compliance authority with controlled spontaneity.' },
  { id: 'peli-dorn', speakerLabels: ['Peli Dorn'], castingBrief: 'Junior but competent, alert and credible without infantilising.' },
  { id: 'recorded-channel', speakerLabels: ['Recorded channel'], castingBrief: 'Neutral accessible channel description with restrained radio texture.' },
  { id: 'sera-quill', speakerLabels: ['Sera Quill'], castingBrief: 'Practical engineer, direct and concrete.' },
  { id: 'sola-iven', speakerLabels: ['Sola Iven'], castingBrief: 'Human urgency balanced by evidentiary discipline.' },
  { id: 'tali-rusk', speakerLabels: ['Tali Rusk'], castingBrief: 'Accessible technical specialist with deliberate explanation.' },
  { id: 'toma-reed', speakerLabels: ['Toma Reed'], castingBrief: 'Experienced maritime register without accent caricature.' },
  { id: 'tovan-mir', speakerLabels: ['Tovan Mir'], castingBrief: 'Meticulous records language, times and identifiers.' },
  { id: 'yara-merrow', speakerLabels: ['Yara Merrow'], castingBrief: 'Quiet analytical confidence and operational precision.' },
] as const
const providers: CourtWeekPerformanceManifest['providers'] = [
  { id: 'google-chirp3-hd-en-au', label: 'Google Cloud Chirp 3 HD en-AU', delivery: 'managed-batch-api', configuration: 'One-off stock-voice synthesis only; no runtime dependency or automatic retry', serviceModel: 'Chirp 3: HD voices', documentationUrl: 'https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd', pricingUrl: 'https://cloud.google.com/text-to-speech/pricing', voiceInventory: { locale: 'en-AU', count: 30, status: 'verified', inventorySha256: GOOGLE_CHIRP3_INVENTORY_DIGEST } },
]
const REQUIRED_PRONUNCIATION_PROJECTIONS = [
  { id: 'section-18', canonical: 's 18', spoken: 'section eighteen' },
  { id: 'section-22', canonical: 's 22', spoken: 'section twenty-two' },
  { id: 'sha-256', canonical: 'SHA-256', spoken: 'S H A two fifty-six' },
]
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}

const sha256 = (value: unknown): string => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`

export function courtWeekPerformanceSourceDigest(courtWeek: CourtWeek = elevenMinutesCourtWeek): string {
  const source = courtWeek.manifest.sessions.map((session) => ({
    id: session.id, day: session.day, scenes: session.scenes.map((scene) => ({
      id: scene.id, cues: scene.cues.map((cue) => ({
        id: cue.id, sourceCueId: cue.sourceCueId ?? null, speaker: cue.speaker, tone: cue.tone, text: cue.text,
        turns: hasExplicitReviewedTurns(cue)
          ? (cue as unknown as { turns: unknown }).turns
          : splitCueTurns(cue).map(({ id, speaker, text }) => ({ id, speaker, text })),
      })),
    })),
  }))
  return sha256({ schema: 'simjury.court-week-performance-source/v1', caseId: courtWeek.manifest.id, revision: courtWeek.manifest.revision, sessions: source })
}

const hasExplicitReviewedTurns = (cue: unknown): boolean => Array.isArray((cue as { turns?: unknown }).turns)
  && ((cue as { turns: unknown[] }).turns).every((turn) => typeof turn === 'object' && turn !== null
    && 'actorId' in turn && 'displayLabel' in turn && 'speechMode' in turn && 'legalAction' in turn)

export const courtWeekPerformanceSourceContract = (courtWeek: CourtWeek = elevenMinutesCourtWeek) => (
  courtWeek.manifest.sessions.every(({ scenes }) => scenes.every(({ cues }) => cues.every(
    hasExplicitReviewedTurns,
  ))) ? 'explicit-reviewed' : 'legacy-inferred'
)

const synthesisPayload = (payload: PerformancePayload) => ({
  sourceDigest: payload.sourceDigest,
  providers: payload.providers.map((provider) => ({
    ...provider,
    voiceInventory: { locale: provider.voiceInventory.locale, count: provider.voiceInventory.count, inventorySha256: provider.voiceInventory.inventorySha256 },
  })),
  identities: payload.identities,
  pronunciationProjections: payload.pronunciationProjections.map(({ id, canonical, spoken }) => ({ id, canonical, spoken })),
})
export const calculatePerformanceDigest = (payload: PerformancePayload): string => sha256(synthesisPayload(payload))
const calculateGovernanceDigest = (payload: PerformancePayload): string => sha256(payload)

export function refreshPerformanceDigest(value: unknown): CourtWeekPerformanceManifest {
  const manifest = performanceManifestSchema.parse(value)
  const payload: Partial<CourtWeekPerformanceManifest> = { ...manifest }
  delete payload.performanceDigest
  delete payload.governanceDigest
  const performancePayload = payload as PerformancePayload
  return { ...performancePayload, performanceDigest: calculatePerformanceDigest(performancePayload), governanceDigest: calculateGovernanceDigest(performancePayload) }
}

export function buildCourtWeekPerformanceManifest(): CourtWeekPerformanceManifest {
  const payload: PerformancePayload = {
    schema: PERFORMANCE_MANIFEST_SCHEMA, stage: 'casting', sourceContract: courtWeekPerformanceSourceContract(), caseId: 'cw-0001',
    sourceRevision: elevenMinutesCourtWeek.manifest.revision,
    sourceDigest: courtWeekPerformanceSourceDigest(),
    computePolicy: { maxIncrementalSpendAud: 50, recurringSpendAud: 0, managedBatchApisAllowed: true, runtimeInferenceAllowed: false, cloudflareRuntimeAllowed: false, manualRunApprovalRequired: true, maximumProviderCharacters: 1_000_000, stockVoicesOnly: true, referenceAudioAllowed: false, resumableUnit: 'utterance' },
    providers: structuredClone(providers),
    identities: CANONICAL_PERFORMANCE_IDENTITIES.map((identity) => ({ ...identity, speakerLabels: [...identity.speakerLabels], assignment: null })),
    pronunciationProjections: REQUIRED_PRONUNCIATION_PROJECTIONS.map((projection) => ({ ...projection, status: 'proposed' })),
  }
  return { ...payload, performanceDigest: calculatePerformanceDigest(payload), governanceDigest: calculateGovernanceDigest(payload) }
}

export function validateCourtWeekPerformanceManifest(value: unknown, requireReady = false): CourtWeekPerformanceManifest {
  const manifest = performanceManifestSchema.parse(value)
  const { performanceDigest, governanceDigest, ...payload } = manifest
  if (performanceDigest !== calculatePerformanceDigest(payload)) throw new Error('Performance digest does not match manifest bytes')
  if (governanceDigest !== calculateGovernanceDigest(payload)) throw new Error('Governance digest does not match manifest bytes')
  if (manifest.sourceRevision !== elevenMinutesCourtWeek.manifest.revision) throw new Error('Performance manifest targets a different Court Week revision')
  if (manifest.sourceDigest !== courtWeekPerformanceSourceDigest()) throw new Error('Performance manifest targets a different Court Week source')
  if (manifest.sourceContract !== courtWeekPerformanceSourceContract()) throw new Error('Performance manifest misstates its source contract')
  const canonical = manifest.identities.map(({ id, speakerLabels, castingBrief }) => ({ id, speakerLabels, castingBrief }))
  if (canonicalJson(canonical) !== canonicalJson(CANONICAL_PERFORMANCE_IDENTITIES)) throw new Error('Performance identities differ from the canonical 28-role cast')
  if (canonicalJson(manifest.providers) !== canonicalJson(providers)) throw new Error('Performance providers differ from the canonical Chirp authority')
  const assigned = manifest.identities.flatMap(({ assignment }) => assignment ? [assignment] : [])
  const chirpVoices = new Set(GOOGLE_CHIRP3_SOURCE.inventory.voices.map(({ voiceId }) => voiceId))
  if (assigned.some(({ voiceProfileId }) => !chirpVoices.has(voiceProfileId))) throw new Error('An assignment names an unknown Chirp 3 HD en-AU stock voice')
  if (new Set(assigned.map(({ providerId, voiceProfileId }) => `${providerId}:${voiceProfileId}`)).size !== assigned.length) throw new Error('Assigned identities must use distinct provider voice profiles')
  const sourceText = canonicalJson(elevenMinutesCourtWeek.manifest.sessions)
  const projectionDefinitions = manifest.pronunciationProjections.map(({ id, canonical, spoken }) => ({ id, canonical, spoken }))
  if (canonicalJson(projectionDefinitions) !== canonicalJson(REQUIRED_PRONUNCIATION_PROJECTIONS)) throw new Error('Required pronunciation projections differ from the canonical set')
  for (const projection of manifest.pronunciationProjections) {
    if (!sourceText.includes(projection.canonical)) throw new Error(`Pronunciation projection ${projection.id} is absent from source`)
  }
  const ready = requireReady || manifest.stage === 'approved'
  if (ready) {
    if (assigned.length !== 28) throw new Error('Every performance identity requires a reviewed voice assignment')
    if (manifest.sourceContract !== 'explicit-reviewed') throw new Error('Release requires the explicit reviewed-turn source contract')
    if (manifest.providers[0].voiceInventory.status !== 'verified') throw new Error('Chirp provider voice inventory is not verified')
    if (manifest.pronunciationProjections.some(({ status }) => status !== 'approved')) throw new Error('Pronunciation projections still require approval')
  }
  return manifest
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('-')) throw new Error(`${name} requires a value`)
  return value
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const input = argument('--input')
  const source = input ? JSON.parse(readFileSync(resolve(input), 'utf8')) : buildCourtWeekPerformanceManifest()
  const manifest = validateCourtWeekPerformanceManifest(
    process.argv.includes('--refresh-digest') ? refreshPerformanceDigest(source) : source,
    process.argv.includes('--require-ready'),
  )
  const output = argument('--output')
  if (output) {
    mkdirSync(dirname(resolve(output)), { recursive: true })
    writeFileSync(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`)
  } else console.log(JSON.stringify(manifest, null, 2))
}
