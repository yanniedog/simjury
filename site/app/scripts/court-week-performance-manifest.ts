import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { splitCueTurns } from '../src/courtweek/content/cueTurns'
import type { CourtWeek } from '../src/courtweek/model/schema'
import { GOOGLE_CHIRP3_INVENTORY_DIGEST } from './court-week-chirp-source'
export const PERFORMANCE_MANIFEST_SCHEMA = 'simjury.court-week-performance/v1' as const
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const httpsUrl = z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS is required')

const componentSchema = z.object({
  kind: z.enum(['engine', 'model']),
  name: z.string().min(1),
  repository: httpsUrl,
  revision: z.string().regex(/^[0-9a-f]{40}$/u),
  selector: z.string().min(1),
  licenseSpdx: z.enum(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause']),
  licenseUrl: httpsUrl,
  acquisition: z.enum(['pending', 'verified']),
  artifactInventorySha256: digestSchema.nullable(),
}).strict().superRefine((component, context) => {
  if ((component.acquisition === 'verified') !== (component.artifactInventorySha256 !== null)) {
    context.addIssue({ code: 'custom', message: 'Verified acquisition requires its inventory digest' })
  }
})

const providerBaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  label: z.string().min(1),
  configuration: z.string().min(1),
})

const providerSchema = z.discriminatedUnion('delivery', [providerBaseSchema.extend({
  delivery: z.literal('offline-model'),
  components: z.array(componentSchema).min(2),
}).strict(), providerBaseSchema.extend({
  delivery: z.literal('managed-batch-api'),
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
}).strict()])

const assignmentBaseSchema = z.object({
  providerId: z.string().regex(/^[a-z0-9-]+$/u),
  voiceProfileId: z.string().regex(/^[a-z0-9-]+$/u),
})
const assignmentSchema = z.discriminatedUnion('source', [assignmentBaseSchema.extend({
  source: z.literal('provider-stock'),
}).strict(), assignmentBaseSchema.extend({
  source: z.literal('consented-reference'),
  consentReceiptSha256: digestSchema,
  referenceAudioSha256: digestSchema,
}).strict()])

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
  stage: z.enum(['bakeoff', 'approved']),
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
    referenceConsentRequired: z.literal(true), resumableUnit: z.literal('utterance'),
  }).strict(),
  providers: z.array(providerSchema).min(1),
  identities: z.array(identitySchema).length(28),
  pronunciationProjections: z.array(projectionSchema),
}).strict()

export type CourtWeekPerformanceManifest = z.infer<typeof performanceManifestSchema>
type PerformancePayload = Omit<CourtWeekPerformanceManifest, 'performanceDigest' | 'governanceDigest'>

export const CANONICAL_PERFORMANCE_IDENTITIES = [
  { id: 'ari-tem', speakerLabels: ['Ari Tem'], castingBrief: 'Analytical, clipped and grounded without sounding robotic.' },
  { id: 'bram-tey', speakerLabels: ['Bram Tey'], castingBrief: 'Thoughtful, design-literate and conversationally restrained.' },
  { id: 'clerk', speakerLabels: ['Clerk'], castingBrief: 'Crisp formal procedure with exceptional intelligibility.' },
  { id: 'court-officer', speakerLabels: ['Court officer'], castingBrief: 'Warm procedural authority, distinct from clerk and judge.' },
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
  { id: 'chatterbox-v3', label: 'Chatterbox Multilingual V3', delivery: 'offline-model', configuration: 'English with consented Australian reference; t3_model=v3', components: [
    { kind: 'engine', name: 'Chatterbox', repository: 'https://github.com/resemble-ai/chatterbox', revision: '5de7a54aa4e5e2baadb0182dde554908b48b85c2', selector: 'ChatterboxMultilingualTTS', licenseSpdx: 'MIT', licenseUrl: 'https://github.com/resemble-ai/chatterbox/blob/5de7a54aa4e5e2baadb0182dde554908b48b85c2/LICENSE', acquisition: 'pending', artifactInventorySha256: null },
    { kind: 'model', name: 'Chatterbox V3 weights', repository: 'https://huggingface.co/ResembleAI/chatterbox', revision: '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18', selector: 't3_mtl23ls_v3.safetensors', licenseSpdx: 'MIT', licenseUrl: 'https://huggingface.co/ResembleAI/chatterbox/blob/5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18/README.md', acquisition: 'pending', artifactInventorySha256: null },
  ] },
  { id: 'chatterbox-turbo', label: 'Chatterbox Turbo', delivery: 'offline-model', configuration: 'English with consented Australian 10-second reference', components: [
    { kind: 'engine', name: 'Chatterbox', repository: 'https://github.com/resemble-ai/chatterbox', revision: '5de7a54aa4e5e2baadb0182dde554908b48b85c2', selector: 'ChatterboxTurboTTS', licenseSpdx: 'MIT', licenseUrl: 'https://github.com/resemble-ai/chatterbox/blob/5de7a54aa4e5e2baadb0182dde554908b48b85c2/LICENSE', acquisition: 'pending', artifactInventorySha256: null },
    { kind: 'model', name: 'Chatterbox Turbo weights', repository: 'https://huggingface.co/ResembleAI/chatterbox-turbo', revision: '749d1c1a46eb10492095d68fbcf55691ccf137cd', selector: 't3_turbo_v1.safetensors', licenseSpdx: 'MIT', licenseUrl: 'https://huggingface.co/ResembleAI/chatterbox-turbo/blob/749d1c1a46eb10492095d68fbcf55691ccf137cd/README.md', acquisition: 'pending', artifactInventorySha256: null },
  ] },
  { id: 'melo-en-au-openvoice-v2', label: 'MeloTTS EN-AU plus OpenVoice V2', delivery: 'offline-model', configuration: 'MeloTTS EN-AU accent base followed by consented tone-colour conversion', components: [
    { kind: 'engine', name: 'MeloTTS', repository: 'https://github.com/myshell-ai/MeloTTS', revision: '209145371cff8fc3bd60d7be902ea69cbdb7965a', selector: 'TTS(language=EN); speaker=EN-AU', licenseSpdx: 'MIT', licenseUrl: 'https://github.com/myshell-ai/MeloTTS/blob/209145371cff8fc3bd60d7be902ea69cbdb7965a/LICENSE', acquisition: 'pending', artifactInventorySha256: null },
    { kind: 'model', name: 'MeloTTS English weights', repository: 'https://huggingface.co/myshell-ai/MeloTTS-English', revision: 'bb4fb7346d566d277ba8c8c7dbfdf6786139b8ef', selector: 'EN-AU', licenseSpdx: 'MIT', licenseUrl: 'https://huggingface.co/myshell-ai/MeloTTS-English/blob/bb4fb7346d566d277ba8c8c7dbfdf6786139b8ef/README.md', acquisition: 'pending', artifactInventorySha256: null },
    { kind: 'engine', name: 'OpenVoice', repository: 'https://github.com/myshell-ai/OpenVoice', revision: '74a1d147b17a8c3092dd5430504bd83ef6c7eb23', selector: 'ToneColorConverter v2', licenseSpdx: 'MIT', licenseUrl: 'https://github.com/myshell-ai/OpenVoice/blob/74a1d147b17a8c3092dd5430504bd83ef6c7eb23/LICENSE', acquisition: 'pending', artifactInventorySha256: null },
    { kind: 'model', name: 'OpenVoice V2 weights', repository: 'https://huggingface.co/myshell-ai/OpenVoiceV2', revision: 'f36e7edfe1684461a8343844af60babc2efbb727', selector: 'converter', licenseSpdx: 'MIT', licenseUrl: 'https://huggingface.co/myshell-ai/OpenVoiceV2/blob/f36e7edfe1684461a8343844af60babc2efbb727/README.md', acquisition: 'pending', artifactInventorySha256: null },
  ] },
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
  providers: payload.providers.map((provider) => provider.delivery === 'offline-model'
    ? { ...provider, components: provider.components.map(({ kind, name, repository, revision, selector, licenseSpdx, licenseUrl, artifactInventorySha256 }) => ({ kind, name, repository, revision, selector, licenseSpdx, licenseUrl, artifactInventorySha256 })) }
    : { ...provider, voiceInventory: { locale: provider.voiceInventory.locale, count: provider.voiceInventory.count, inventorySha256: provider.voiceInventory.inventorySha256 } }),
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
    schema: PERFORMANCE_MANIFEST_SCHEMA, stage: 'bakeoff', sourceContract: courtWeekPerformanceSourceContract(), caseId: 'cw-0001',
    sourceRevision: elevenMinutesCourtWeek.manifest.revision,
    sourceDigest: courtWeekPerformanceSourceDigest(),
    computePolicy: { maxIncrementalSpendAud: 50, recurringSpendAud: 0, managedBatchApisAllowed: true, runtimeInferenceAllowed: false, cloudflareRuntimeAllowed: false, manualRunApprovalRequired: true, maximumProviderCharacters: 1_000_000, referenceConsentRequired: true, resumableUnit: 'utterance' },
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
  const providerIds = manifest.providers.map(({ id }) => id)
  if (new Set(providerIds).size !== providerIds.length) throw new Error('Provider ids must be unique')
  const assigned = manifest.identities.flatMap(({ assignment }) => assignment ? [assignment] : [])
  if (assigned.some(({ providerId }) => !providerIds.includes(providerId))) throw new Error('An assignment names an unknown provider')
  const referenced = assigned.filter((assignment) => assignment.source === 'consented-reference')
  if (new Set(referenced.map(({ consentReceiptSha256 }) => consentReceiptSha256)).size !== referenced.length) throw new Error('Referenced identities must use distinct donor consent receipts')
  if (new Set(referenced.map(({ referenceAudioSha256 }) => referenceAudioSha256)).size !== referenced.length) throw new Error('Referenced identities must use distinct reference recordings')
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
    const selected = new Set(assigned.map(({ providerId }) => providerId))
    const selectedProviders = manifest.providers.filter(({ id }) => selected.has(id))
    if (selectedProviders.some((provider) => provider.delivery === 'offline-model'
      && provider.components.some(({ acquisition }) => acquisition !== 'verified'))) throw new Error('Selected offline provider artifacts are not verified acquisitions')
    if (selectedProviders.some((provider) => provider.delivery === 'managed-batch-api'
      && provider.voiceInventory.status !== 'verified')) throw new Error('Selected managed provider voice inventory is not verified')
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
