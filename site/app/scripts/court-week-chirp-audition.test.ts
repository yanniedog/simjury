import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST,
  GOOGLE_CHIRP3_INVENTORY_DIGEST,
  GOOGLE_CHIRP3_PRICING_DIGEST,
} from './court-week-chirp-source'
import {
  assertAuditionOutputDirectory,
  buildChirpAuditionPlan,
  CHIRP_AUDITION_TEXT,
  executeChirpAudition,
  redactSecrets,
  runChirpAuditionCli,
} from './court-week-chirp-audition'

const environment = {
  GOOGLE_OAUTH_ACCESS_TOKEN: 'test-only-secret-token',
  GOOGLE_CLOUD_QUOTA_PROJECT: 'test-only-project',
}
const executeArgs = (output: string) => [
  '--execute', '--output', output, '--acknowledge-cost-aud', '0.285230',
]

describe('manual Google Chirp 3 HD audition contract', () => {
  it('plans 30 distinct content-addressed jobs from the frozen source', () => {
    const plan = buildChirpAuditionPlan()
    expect(buildChirpAuditionPlan()).toEqual(plan)
    expect(plan.jobs).toHaveLength(30)
    expect(new Set(plan.jobs.map(({ voiceId }) => voiceId)).size).toBe(30)
    expect(new Set(plan.jobs.map(({ jobId }) => jobId)).size).toBe(30)
    expect(plan.jobs.every(({ jobId }) => /^[0-9a-f]{64}$/u.test(jobId))).toBe(true)
    expect(plan.jobs.every(({ request }) => request.input.text === CHIRP_AUDITION_TEXT)).toBe(true)
    expect(plan.audition).toEqual({ text: CHIRP_AUDITION_TEXT, characterCount: 224, identicalAcrossVoices: true })
    expect(plan.characterTotals).toEqual({ jobCount: 30, providerCharacters: 6_720 })
    expect(plan).not.toHaveProperty('binding')
    expect(plan.planDigest).toBe('sha256:7829e66018a9f2cd838a4982cb0db1371c62d501ab53b2042899d0f01e3fff12')
  })

  it('pins conservative gross cost and official-source provenance', () => {
    const plan = buildChirpAuditionPlan()
    expect(plan.conservativeGrossCost).toMatchObject({
      freeTierCharactersApplied: 0, grossUsdMicros: 201_600, grossAudMicros: 285_230,
      exactAudAcknowledgement: '0.285230', hardMaximumAudMicros: 50_000_000,
    })
    expect(plan.conservativeGrossCost.grossAudMicros).toBeLessThan(plan.conservativeGrossCost.auditionTargetAudMicros)
    expect(plan.provenance.inventory.digest).toBe(GOOGLE_CHIRP3_INVENTORY_DIGEST)
    expect(plan.provenance.pricing.digest).toBe(GOOGLE_CHIRP3_PRICING_DIGEST)
    expect(plan.provenance.audConversion.digest).toBe(GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST)
    for (const url of [
      ...plan.provenance.inventory.sourceUrls, plan.provenance.pricing.sourceUrl,
      plan.provenance.apiContractUrl, plan.provenance.authContractUrl,
    ]) expect(['cloud.google.com', 'docs.cloud.google.com']).toContain(new URL(url).hostname)
  })

  it('never executes by default and requires exact, separate execution gates', async () => {
    let calls = 0
    const forbiddenFetch: typeof fetch = async () => {
      calls += 1
      throw new Error('network must remain idle')
    }
    expect((await runChirpAuditionCli([], environment, forbiddenFetch)).mode).toBe('plan')
    expect(calls).toBe(0)
    await expect(runChirpAuditionCli(['--execute'], environment, forbiddenFetch)).rejects.toThrow(/output is required/i)
    await expect(runChirpAuditionCli([
      '--execute', '--output', tmpdir(), '--acknowledge-cost-aud', '0.29',
    ], environment, forbiddenFetch)).rejects.toThrow(/exactly equal 0\.285230/i)
    expect(calls).toBe(0)
    expect(() => assertAuditionOutputDirectory(process.cwd())).toThrow(/outside the repository/i)
  })

  it('writes exclusive pairs, resumes matches, and rejects a mismatch', async () => {
    const output = mkdtempSync(join(tmpdir(), 'simjury-chirp-audition-'))
    let calls = 0
    const fakeFetch: typeof fetch = async (...args) => {
      calls += 1
      const body = JSON.parse(String(args[1]?.body)) as { voice: { name: string } }
      return new Response(JSON.stringify({
        audioContent: Buffer.from(`audio:${body.voice.name}`).toString('base64'),
      }), { status: 200, headers: { 'content-type': 'application/json', 'x-guploader-uploadid': 'request-1' } })
    }
    try {
      const first = await runChirpAuditionCli(executeArgs(output), environment, fakeFetch)
      expect(first).toMatchObject({ mode: 'execute', result: { completed: 30, resumed: 0 } })
      expect(calls).toBe(30)
      expect(readdirSync(output)).toHaveLength(60)
      const metadata = readdirSync(output).filter((name) => name.endsWith('.json'))
        .map((name) => readFileSync(join(output, name), 'utf8')).join('')
      expect(metadata).not.toContain(environment.GOOGLE_OAUTH_ACCESS_TOKEN)
      expect(metadata).not.toContain(environment.GOOGLE_CLOUD_QUOTA_PROJECT)
      expect(metadata).not.toContain(output)
      const second = await runChirpAuditionCli(executeArgs(output), environment, fakeFetch)
      expect(second).toMatchObject({ mode: 'execute', result: { completed: 0, resumed: 30 } })
      expect(calls).toBe(30)
      const firstAudio = readdirSync(output).find((name) => name.endsWith('.mp3'))
      writeFileSync(join(output, firstAudio!), 'mismatch')
      await expect(executeChirpAudition(
        buildChirpAuditionPlan(), output, environment.GOOGLE_OAUTH_ACCESS_TOKEN,
        environment.GOOGLE_CLOUD_QUOTA_PROJECT, fakeFetch,
      )).rejects.toThrow(/does not match.*refusing to overwrite/i)
      expect(calls).toBe(30)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })

  it('does not retry a provider failure and redacts credentials', async () => {
    const output = mkdtempSync(join(tmpdir(), 'simjury-chirp-failure-'))
    let calls = 0
    const failingFetch: typeof fetch = async () => {
      calls += 1
      return new Response(`Bearer ${environment.GOOGLE_OAUTH_ACCESS_TOKEN}`, { status: 500 })
    }
    try {
      let failure = ''
      try {
        await executeChirpAudition(
          buildChirpAuditionPlan(), output, environment.GOOGLE_OAUTH_ACCESS_TOKEN,
          environment.GOOGLE_CLOUD_QUOTA_PROJECT, failingFetch,
        )
      } catch (error) {
        failure = String(error)
      }
      expect(calls).toBe(1)
      expect(failure).toContain('[REDACTED]')
      expect(failure).not.toContain(environment.GOOGLE_OAUTH_ACCESS_TOKEN)
      expect(redactSecrets('Bearer abc secret=abc', ['abc'])).toBe('Bearer [REDACTED] secret=[REDACTED]')
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
