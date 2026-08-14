import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST,
  GOOGLE_CHIRP3_INVENTORY_DIGEST,
  GOOGLE_CHIRP3_PRICING_DIGEST,
  GOOGLE_CHIRP3_SOURCE,
} from './court-week-chirp-source'

export const CHIRP_AUDITION_SCHEMA = 'simjury.google-chirp3-hd-audition/v1' as const
export const CHIRP_AUDITION_TEXT = 'Judge Sel Aven asks Crown counsel Asha Renn and defence counsel Corin Dax to attend at 9:17 on 14 August. The clerk asks Mara Venn, "How do you plead?" Mara Venn answers, "Not guilty." Juror 12, weigh only admitted evidence.'
const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '../../..')

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  return JSON.stringify(value)
}
const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const digest = (value: unknown): string => `sha256:${sha256(canonicalJson(value))}`

export function buildChirpAuditionPlan() {
  const source = GOOGLE_CHIRP3_SOURCE
  const characterCount = [...CHIRP_AUDITION_TEXT].length
  const providerCharacters = characterCount * source.inventory.voices.length
  const grossUsdMicros = Math.ceil(providerCharacters
    * source.pricing.usdMicrosPerMillionCharactersAfterFreeTier / 1_000_000)
  const grossAudMicros = Math.ceil(grossUsdMicros * source.audConversion.audMicrosPerUsd / 1_000_000)
  if (grossAudMicros >= 50_000_000) throw new Error('Audition plan must remain strictly below AUD 50')
  if (grossAudMicros >= 1_000_000) throw new Error('Audition plan must remain below its AUD 1 target')
  const jobs = source.inventory.voices.map(({ voiceId }) => {
    const request = {
      input: { text: CHIRP_AUDITION_TEXT },
      voice: { languageCode: 'en-AU', name: voiceId },
      audioConfig: { audioEncoding: 'MP3' },
    }
    const requestSha256 = digest(request)
    return { jobId: requestSha256.slice(7), voiceId, requestSha256, request }
  })
  const payload = {
    schema: CHIRP_AUDITION_SCHEMA,
    provider: { endpoint, locale: 'en-AU', model: source.inventory.model, audioEncoding: 'MP3' as const },
    audition: { text: CHIRP_AUDITION_TEXT, characterCount, identicalAcrossVoices: true as const },
    characterTotals: { jobCount: jobs.length, providerCharacters },
    conservativeGrossCost: {
      freeTierCharactersApplied: 0 as const, grossUsdMicros, grossAudMicros,
      exactAudAcknowledgement: (grossAudMicros / 1_000_000).toFixed(6),
      hardMaximumAudMicros: 50_000_000, auditionTargetAudMicros: 1_000_000,
    },
    provenance: {
      capturedAt: source.capturedAt,
      inventory: { sourceUrls: source.inventory.sourceUrls, digest: GOOGLE_CHIRP3_INVENTORY_DIGEST },
      pricing: { sourceUrl: source.pricing.sourceUrl, sku: source.pricing.sku, digest: GOOGLE_CHIRP3_PRICING_DIGEST },
      audConversion: { sourceUrl: source.audConversion.sourceUrl, observationDate: source.audConversion.observationDate, digest: GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST },
      apiContractUrl: 'https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize',
      authContractUrl: 'https://docs.cloud.google.com/docs/authentication/rest',
    },
    policy: { manualOnly: true as const, runtimeUse: false as const, recurringService: false as const, blindRetry: false as const },
    jobs,
  }
  return { ...payload, planDigest: digest(payload) }
}

const isWithin = (root: string, target: string): boolean => {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export function assertAuditionOutputDirectory(input: string, repo = repositoryRoot): string {
  const output = realpathSync(resolve(input))
  if (!statSync(output).isDirectory()) throw new Error('Audition output must be an existing directory')
  if (isWithin(realpathSync(repo), output)) throw new Error('Audition output must be outside the repository and shipped asset paths')
  return output
}

export function redactSecrets(value: unknown, secrets: readonly (string | undefined)[] = []): string {
  let safe = value instanceof Error ? value.message : String(value)
  safe = safe.replace(/Bearer\s+[^\s"']+/giu, 'Bearer [REDACTED]')
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[REDACTED]')
  return safe
}

type AuditionPlan = ReturnType<typeof buildChirpAuditionPlan>
type AuditionJob = AuditionPlan['jobs'][number]

function verifyOrRejectExisting(job: AuditionJob, audioPath: string, metadataPath: string): boolean {
  const audioExists = existsSync(audioPath)
  const metadataExists = existsSync(metadataPath)
  if (!audioExists && !metadataExists) return false
  if (!audioExists || !metadataExists) throw new Error(`${job.voiceId}: partial output exists; refusing to overwrite`)
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>
    const audioSha256 = `sha256:${sha256(readFileSync(audioPath))}`
    const providerResponse = metadata.providerResponse as Record<string, unknown> | undefined
    if (metadata.schema !== CHIRP_AUDITION_SCHEMA || metadata.jobId !== job.jobId
      || metadata.voiceId !== job.voiceId || metadata.requestSha256 !== job.requestSha256
      || metadata.audioSha256 !== audioSha256
      || !/^sha256:[0-9a-f]{64}$/u.test(String(providerResponse?.bodySha256))) throw new Error()
  } catch {
    throw new Error(`${job.voiceId}: existing output does not match this job; refusing to overwrite`)
  }
  return true
}

export async function executeChirpAudition(
  plan: AuditionPlan,
  outputInput: string,
  accessToken: string,
  quotaProject: string,
  fetcher: typeof fetch = fetch,
) {
  if (!accessToken.trim() || !quotaProject.trim()) throw new Error('Audition credentials and quota project are required')
  const output = assertAuditionOutputDirectory(outputInput)
  let completed = 0
  let resumed = 0
  for (const job of plan.jobs) {
    const audioPath = join(output, `${job.jobId}.mp3`)
    const metadataPath = join(output, `${job.jobId}.json`)
    if (verifyOrRejectExisting(job, audioPath, metadataPath)) {
      resumed += 1
      continue
    }
    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000), body: JSON.stringify(job.request),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
          'x-goog-user-project': quotaProject,
        },
      })
    } catch (error) {
      throw new Error(redactSecrets(error, [accessToken]))
    }
    const rawResponse = await response.text()
    if (!response.ok) throw new Error(redactSecrets(
      `Google TTS request failed (${response.status}): ${rawResponse.slice(0, 500)}`, [accessToken],
    ))
    let audio: Buffer
    try {
      const parsed = JSON.parse(rawResponse) as { audioContent?: unknown }
      if (typeof parsed.audioContent !== 'string' || !parsed.audioContent) throw new Error()
      audio = Buffer.from(parsed.audioContent, 'base64')
      if (!audio.length) throw new Error()
    } catch {
      throw new Error(`${job.voiceId}: provider response did not contain valid audioContent`)
    }
    const metadata = {
      schema: CHIRP_AUDITION_SCHEMA, jobId: job.jobId, voiceId: job.voiceId,
      requestSha256: job.requestSha256, audioSha256: `sha256:${sha256(audio)}`,
      providerResponse: {
        status: response.status, bodySha256: `sha256:${sha256(rawResponse)}`,
        contentType: response.headers.get('content-type'),
        requestId: response.headers.get('x-guploader-uploadid'),
      },
    }
    writeFileSync(audioPath, audio, { flag: 'wx' })
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' })
    completed += 1
  }
  return { completed, resumed, planDigest: plan.planDigest }
}

const argument = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

export async function runChirpAuditionCli(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  fetcher: typeof fetch = fetch,
) {
  const plan = buildChirpAuditionPlan()
  if (!args.includes('--execute')) return { mode: 'plan' as const, plan }
  const output = argument(args, '--output')
  const acknowledgement = argument(args, '--acknowledge-cost-aud')
  if (!output) throw new Error('--output is required with --execute')
  if (acknowledgement !== plan.conservativeGrossCost.exactAudAcknowledgement) {
    throw new Error(`--acknowledge-cost-aud must exactly equal ${plan.conservativeGrossCost.exactAudAcknowledgement}`)
  }
  const token = environment.GOOGLE_OAUTH_ACCESS_TOKEN?.trim()
  const quotaProject = environment.GOOGLE_CLOUD_QUOTA_PROJECT?.trim()
  if (!token || !quotaProject) throw new Error('Execution requires GOOGLE_OAUTH_ACCESS_TOKEN and GOOGLE_CLOUD_QUOTA_PROJECT')
  return { mode: 'execute' as const, result: await executeChirpAudition(plan, output, token, quotaProject, fetcher) }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  runChirpAuditionCli(process.argv.slice(2), process.env)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(redactSecrets(error, [token]))
      process.exitCode = 1
    })
}
