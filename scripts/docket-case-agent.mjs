import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { callGeminiCaseAgent } from './gemini-case-agent.mjs'

const PHASES = ['draft', 'story_review', 'legal_review', 'repair']
const TEXT_PATH = /^site\/app\/docket\/dd-\d{4}(?:\.json|\/(?:trial|analysis|legal-sheet|deliberation-pack)\.json)$/
const MEDIA_PATH = /^site\/app\/public\/media\/dd-\d{4}\/(?:cover|characters\/[A-Za-z0-9-]+|beats\/[A-Za-z0-9-]+|context\/[A-Za-z0-9-]+)\.webp$/
const FORBIDDEN_KEYS = /^(?:cmd|command|commands|exec|executable|hook|hooks|run|script|shell)$/i
const REVIEW_CHECKS = {
  legal_review: ['legal_coherence', 'admissibility', 'burden', 'competent_record', 'hook', 'both_sides', 'fair_reversal', 'specificity', 'listenability', 'discussion', 'originality', 'sensitivity', 'read_aloud', 'blind_test'],
  story_review: ['hook', 'both_sides', 'fair_reversal', 'specificity', 'listenability', 'discussion', 'originality', 'sensitivity'],
}

export function readConfig(env = process.env) {
  const required = [
    'CASE_AGENT_ENDPOINT', 'CASE_AGENT_TOKEN', 'CASE_AGENT_PROVIDER', 'CASE_IMAGE_MODEL', 'CASE_IMAGE_LICENSE', 'CASE_DRAFT_MODEL',
    'CASE_LEGAL_REVIEW_MODEL', 'CASE_STORY_REVIEW_MODEL', 'CASE_MAX_ATTEMPTS',
    'CASE_MAX_REPAIR_ATTEMPTS', 'CASE_MAX_IMAGES_PER_CASE', 'CASE_MAX_OUTPUT_BYTES',
    'CASE_MAX_COST_USD', 'CASE_MAX_TOKENS',
  ]
  const missing = required.filter((key) => !env[key]?.trim())
  const enabled = env.CASE_GENERATION_ENABLED === 'true'
  const numbers = {
    maxAttempts: integer(env.CASE_MAX_ATTEMPTS?.trim() || '1', 1, 4, 'CASE_MAX_ATTEMPTS'),
    maxRepairAttempts: integer(env.CASE_MAX_REPAIR_ATTEMPTS?.trim() || '0', 0, 3, 'CASE_MAX_REPAIR_ATTEMPTS'),
    maxImagesPerCase: integer(env.CASE_MAX_IMAGES_PER_CASE?.trim() || '2', 2, 30, 'CASE_MAX_IMAGES_PER_CASE'),
    maxOutputBytes: integer(env.CASE_MAX_OUTPUT_BYTES?.trim() || '1000000', 1_000_000, 80_000_000, 'CASE_MAX_OUTPUT_BYTES'),
    maxCostUsd: decimal(env.CASE_MAX_COST_USD?.trim() || '0.01', 0.01, 500, 'CASE_MAX_COST_USD'),
    maxTokens: integer(env.CASE_MAX_TOKENS?.trim() || '1000', 1000, 200_000, 'CASE_MAX_TOKENS'),
  }
  const models = [env.CASE_DRAFT_MODEL, env.CASE_LEGAL_REVIEW_MODEL, env.CASE_STORY_REVIEW_MODEL]
  if (models.every(Boolean) && new Set(models).size !== models.length) {
    throw new Error('draft, legal-review, and story-review models must be distinct')
  }
  if (env.CASE_AGENT_ENDPOINT && !/^(?:https:\/\/|gemini:\/\/generateContent$)/.test(env.CASE_AGENT_ENDPOINT)) throw new Error('CASE_AGENT_ENDPOINT must use HTTPS or the trusted Gemini adapter')
  return { enabled, missing, ...numbers, endpoint: env.CASE_AGENT_ENDPOINT, token: env.CASE_AGENT_TOKEN, provider: env.CASE_AGENT_PROVIDER, imageModel: env.CASE_IMAGE_MODEL, imageLicense: env.CASE_IMAGE_LICENSE, models }
}

function integer(value, min, max, name) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be ${min}..${max}`)
  return parsed
}

function decimal(value, min, max, name) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be ${min}..${max}`)
  return parsed
}

export function assertSafeResponse(response, expected, config) {
  if (!response || response.schema !== 'simjury.case-agent/v1') throw new Error('unsupported agent response schema')
  if (response.phase !== expected.phase) throw new Error(`expected ${expected.phase} response`)
  if (response.model !== expected.model) throw new Error(`unexpected model for ${expected.phase}`)
  if (response.provider !== config.provider || response.image_model !== config.imageModel || response.image_license !== config.imageLicense) {
    throw new Error('response does not match the pinned provider, image model, and licence')
  }
  if (response.draft_pr !== expected.draftPr) throw new Error('response is not bound to the reserved draft PR')
  if (JSON.stringify(response.dates) !== JSON.stringify(expected.dates)) throw new Error('response dates changed')
  if (!Number.isFinite(response.cost_usd) || response.cost_usd < 0) throw new Error('invalid cost_usd')
  if (!Array.isArray(response.files) || response.files.length === 0) throw new Error('agent returned no files')
  if (expected.phase.endsWith('review')) assertEditorialApproval(response, expected.phase)

  let bytes = 0
  const paths = new Set()
  const imagesByCase = new Map()
  for (const file of response.files) {
    if (file?.type !== 'file' || typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('every artifact must be an explicit regular file')
    }
    const normalized = file.path.replaceAll('\\', '/')
    if (normalized !== file.path || normalized.includes('..') || normalized.startsWith('/') || isAbsolute(normalized)) {
      throw new Error(`unsafe artifact path: ${file.path}`)
    }
    if (!TEXT_PATH.test(normalized) && !MEDIA_PATH.test(normalized)) {
      throw new Error(`artifact outside case allowlist: ${normalized}`)
    }
    if (paths.has(normalized)) throw new Error(`duplicate artifact: ${normalized}`)
    paths.add(normalized)
    const encoding = file.encoding ?? 'utf8'
    if (!['utf8', 'base64'].includes(encoding)) throw new Error(`unsupported encoding: ${encoding}`)
    const data = Buffer.from(file.content, encoding)
    bytes += data.byteLength
    if (extname(normalized) === '.json') {
      if (encoding !== 'utf8') throw new Error(`JSON must use utf8 encoding: ${normalized}`)
      inspectJson(data.toString('utf8'), normalized)
    }
    if (MEDIA_PATH.test(normalized)) {
      if (encoding !== 'base64') throw new Error(`media is not a base64 WebP file: ${normalized}`)
      assertWebpStructure(data, normalized)
      const caseId = normalized.split('/')[4]
      imagesByCase.set(caseId, (imagesByCase.get(caseId) ?? 0) + 1)
    }
  }
  if (bytes > config.maxOutputBytes) throw new Error(`artifact bytes ${bytes} exceed cap ${config.maxOutputBytes}`)
  for (const [caseId, count] of imagesByCase) {
    if (count > config.maxImagesPerCase) throw new Error(`${caseId} has ${count} images; cap is ${config.maxImagesPerCase}`)
  }
  return { bytes, paths: [...paths] }
}

export function assertWebpStructure(data, path = 'generated image') {
  if (data.length < 26 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`media is not a structured WebP file: ${path}`)
  }
  if (data.readUInt32LE(4) + 8 !== data.length) throw new Error(`WebP RIFF length is invalid: ${path}`)
  if (!inspectWebpChunks(data, 12, data.length, path, true)) {
    throw new Error(`WebP has no complete image chunk: ${path}`)
  }
}

function inspectWebpChunks(data, start, limit, path, allowAnimation) {
  let offset = start
  let imageChunk = false
  while (offset + 8 <= limit) {
    const type = data.toString('ascii', offset, offset + 4)
    const size = data.readUInt32LE(offset + 4)
    const end = offset + 8 + size
    if (end > limit) throw new Error(`WebP chunk is truncated: ${path}`)
    if (type === 'VP8L') {
      if (size < 5 || data[offset + 8] !== 0x2f) throw new Error(`WebP VP8L chunk is invalid: ${path}`)
      imageChunk = true
    } else if (type === 'VP8 ') {
      if (size < 10 || data.toString('hex', offset + 11, offset + 14) !== '9d012a') throw new Error(`WebP VP8 chunk is invalid: ${path}`)
      imageChunk = true
    } else if (type === 'ANMF') {
      if (!allowAnimation || size < 24 || !inspectWebpChunks(data, offset + 24, end, path, false)) {
        throw new Error(`WebP animation frame has no complete image data: ${path}`)
      }
      imageChunk = true
    }
    offset = end + (size % 2)
  }
  if (offset !== limit) throw new Error(`WebP chunk layout is invalid: ${path}`)
  return imageChunk
}

function assertEditorialApproval(response, phase) {
  if (response.review?.approved !== true) throw new Error(`${phase} did not approve the revised case`)
  const checks = response.review.checks
  if (!checks || REVIEW_CHECKS[phase].some((key) => checks[key] !== true)) {
    throw new Error(`${phase} must return an all-true editorial checklist`)
  }
}

export function assertGenerationMetadata(response, expected) {
  const jsonFiles = response.files.filter((file) => TEXT_PATH.test(file.path))
  const trials = jsonFiles.map((file) => JSON.parse(file.content)).filter((value) => value.gen_meta)
  if (trials.length !== expected.dates.length) throw new Error('final response must carry one trial gen_meta per commissioned date')
  const publishDates = new Set(trials.map((trial) => trial.publish_date))
  if (publishDates.size !== expected.dates.length || expected.dates.some((date) => !publishDates.has(date))) {
    throw new Error('generated trial publish dates must exactly match the commission')
  }
  for (const trial of trials) {
    const meta = trial.gen_meta
    if (meta.model !== expected.models[0] || meta.prompt_version !== 'dd-2026-v4' || meta.batch_pr !== String(expected.draftPr)) {
      throw new Error('gen_meta does not bind the actual draft model, prompt version, and reserved PR')
    }
    const recorded = [meta.reviewer, meta.language_reviewer, meta.sensitivity_reviewer].join(' ')
    if (!recorded.includes(expected.models[1]) || !recorded.includes(expected.models[2])) {
      throw new Error('gen_meta does not record both independent editorial models')
    }
  }
  const declaredMedia = new Set()
  const collectMedia = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.src === 'string' && node.src.startsWith('/today/media/')) declaredMedia.add(`site/app/public${node.src.slice('/today'.length)}`)
    for (const child of Object.values(node)) collectMedia(child)
  }
  for (const trial of trials) collectMedia(trial.media)
  const returnedMedia = new Set(response.files.filter((file) => MEDIA_PATH.test(file.path)).map((file) => file.path))
  if (declaredMedia.size === 0 || declaredMedia.size !== returnedMedia.size || [...declaredMedia].some((path) => !returnedMedia.has(path))) {
    throw new Error('returned media must exactly match every trial media declaration')
  }
}

function inspectJson(text, path) {
  let value
  try { value = JSON.parse(text) } catch { throw new Error(`invalid generated JSON: ${path}`) }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`command-like key rejected in ${path}: ${key}`)
      visit(child)
    }
  }
  visit(value)
}

export function writeSafeFiles(response, root, expected, config, { overwrite = true, pruneMedia = false } = {}) {
  assertSafeResponse(response, expected, config)
  const rootReal = realpathSync(root)
  const targets = []
  for (const file of response.files) {
    const destination = resolve(rootReal, file.path)
    const rel = relative(rootReal, destination)
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error(`path escaped workspace: ${file.path}`)
    assertNoSymlinkParents(rootReal, dirname(destination))
    if (exists(destination) && !lstatSync(destination).isFile()) throw new Error(`artifact target is not a regular file: ${file.path}`)
    if (!overwrite && exists(destination)) throw new Error(`generation may not overwrite an existing artifact: ${file.path}`)
    targets.push({ file, destination })
  }
  if (pruneMedia) pruneObsoleteMedia(response, rootReal)
  for (const { file, destination } of targets) {
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, Buffer.from(file.content, file.encoding ?? 'utf8'), { flag: 'w', mode: 0o600 })
  }
}

function pruneObsoleteMedia(response, root) {
  const returned = new Set(response.files.filter(({ path }) => MEDIA_PATH.test(path)).map(({ path }) => path))
  const caseIds = new Set([...returned].map((path) => path.split('/')[4]))
  for (const caseId of caseIds) {
    const start = resolve(root, 'site/app/public/media', caseId)
    const pending = [start]
    while (pending.length) {
      const directory = pending.pop()
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const diskPath = resolve(directory, entry.name)
        if (entry.isSymbolicLink()) throw new Error(`symlink media entry rejected: ${diskPath}`)
        if (entry.isDirectory()) pending.push(diskPath)
        else {
          const path = relative(root, diskPath).replaceAll('\\', '/')
          if (MEDIA_PATH.test(path) && !returned.has(path)) unlinkSync(diskPath)
        }
      }
    }
  }
}

export function assertDispositions(response, feedback) {
  const threadIds = new Set(feedback.threads.map((thread) => thread.id))
  if (!Array.isArray(response.dispositions) || response.dispositions.length !== threadIds.size) throw new Error('repair must disposition every unresolved thread')
  for (const item of response.dispositions) {
    if (!threadIds.delete(item.thread_id) || !['Implemented', 'Deferred', 'Declined'].includes(item.status) || !item.reason?.trim()) {
      throw new Error('invalid repair disposition')
    }
  }
}

function assertNoSymlinkParents(root, target) {
  const rel = relative(root, target)
  let cursor = root
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part)
    if (exists(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink parent rejected: ${cursor}`)
  }
}

function exists(path) {
  try { lstatSync(path); return true } catch { return false }
}

async function callAgent(config, request, root) {
  if (config.endpoint === 'gemini://generateContent') return callGeminiCaseAgent(config, request, root)
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20 * 60 * 1000)
    try {
      const response = await fetch(config.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, attempt, idempotency_key: requestIdempotencyKey(request) }),
      })
      if (!response.ok) {
        if (attempt < config.maxAttempts && response.status >= 500) continue
        throw new Error(`case agent returned HTTP ${response.status}`)
      }
      const length = Number(response.headers.get('content-length') ?? 0)
      if (length > config.maxOutputBytes * 1.4) throw new Error('case agent response exceeds byte cap')
      return await boundedJson(response, Math.ceil(config.maxOutputBytes * 1.4))
    } finally { clearTimeout(timer) }
  }
  throw new Error('case agent exhausted bounded attempts')
}

export function requestIdempotencyKey(request, repository = process.env.GITHUB_REPOSITORY) {
  const revision = request.phase === 'repair' ? `:${request.repair_attempt}` : ''
  return `${repository}:${request.draft_pr}:${request.phase}${revision}`
}

export async function boundedJson(response, limit) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('case agent returned no response body')
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error('case agent streamed response exceeds byte cap')
    }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function run() {
  const [command, ...args] = process.argv.slice(2)
  const config = readConfig()
  if (command === 'config') {
    process.stdout.write(`${JSON.stringify({ enabled: config.enabled, missing: config.missing })}\n`)
    process.exitCode = config.enabled && config.missing.length === 0 ? 0 : 2
    return
  }
  if (!['generate', 'repair'].includes(command)) throw new Error('usage: docket-case-agent.mjs config | generate|repair --dates CSV --pr N --root PATH')
  if (!config.enabled || config.missing.length) throw new Error(`generation disabled or unconfigured: ${config.missing.join(', ')}`)
  const value = (name) => args[args.indexOf(name) + 1]
  const dates = value('--dates')?.split(',').filter(Boolean) ?? []
  const draftPr = Number(value('--pr'))
  const root = resolve(value('--root') ?? '.')
  if (!dates.length || !Number.isInteger(draftPr)) throw new Error('dates and reserved draft PR are required')

  if (command === 'repair') {
    const feedbackPath = value('--feedback')
    const attempt = Number(value('--repair-attempt'))
    const alreadySpent = Number(value('--spent-usd') ?? 0)
    if (!feedbackPath || !Number.isInteger(attempt) || attempt < 1 || attempt > config.maxRepairAttempts) {
      throw new Error('repair requires feedback and an attempt within CASE_MAX_REPAIR_ATTEMPTS')
    }
    const feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'))
    if (!Array.isArray(feedback.threads) || feedback.threads.length === 0) throw new Error('repair requires unresolved review threads')
    const model = config.models[1]
    const totalBudget = config.maxCostUsd * dates.length
    if (!Number.isFinite(alreadySpent) || alreadySpent < 0 || alreadySpent >= totalBudget) throw new Error('case budget is exhausted')
    const response = await callAgent(config, {
      schema: 'simjury.case-agent/v1', phase: 'repair', dates, draft_pr: draftPr, model, feedback,
      repair_attempt: attempt,
      provider: config.provider, image_model: config.imageModel, image_license: config.imageLicense,
      limits: { attempt, tokens: config.maxTokens, images_per_case: config.maxImagesPerCase, output_bytes: config.maxOutputBytes, remaining_cost_usd: totalBudget - alreadySpent },
      authorities: ['CLAUDE.md', 'DAILY-PIVOT.md', 'docs/COMMISSION-BRIEF.md', 'docs/DAILY-CASES.md'],
    }, root)
    assertSafeResponse(response, { phase: 'repair', model, draftPr, dates }, config)
    if (alreadySpent + response.cost_usd > totalBudget) throw new Error('repair exceeds the per-case budget cap')
    assertDispositions(response, feedback)
    assertGenerationMetadata(response, { dates, draftPr, models: config.models })
    writeSafeFiles(response, root, { phase: 'repair', model, draftPr, dates }, config, { pruneMedia: true })
    process.stdout.write(`${JSON.stringify({ spent_usd: alreadySpent + response.cost_usd, dispositions: response.dispositions })}\n`)
    return
  }

  const authorityPaths = ['CLAUDE.md', 'DAILY-PIVOT.md', 'docs/COMMISSION-BRIEF.md', 'docs/DAILY-CASES.md', 'docs/DAILY-PROMPT-PACK.md']
  const authorityDocuments = Object.fromEntries(authorityPaths.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]))
  let prior
  const statePath = resolve(root, '.automation/docket-case-generation.json')
  let spent = exists(statePath) ? Number(JSON.parse(readFileSync(statePath, 'utf8')).spent_usd ?? 0) : 0
  const totalBudget = config.maxCostUsd * dates.length
  const models = [config.models[0], config.models[2], config.models[1]]
  for (let index = 0; index < 3; index += 1) {
    const phase = PHASES[index]
    const request = {
      schema: 'simjury.case-agent/v1', phase, dates, draft_pr: draftPr,
      model: models[index], prior_request_id: prior?.request_id,
      provider: config.provider, image_model: config.imageModel, image_license: config.imageLicense,
      limits: { attempts: config.maxAttempts, tokens: config.maxTokens, images_per_case: config.maxImagesPerCase, output_bytes: config.maxOutputBytes, remaining_cost_usd: totalBudget - spent },
      repository: process.env.GITHUB_REPOSITORY, source_ref: process.env.GITHUB_SHA,
      authority_documents: authorityDocuments,
    }
    if (prior) request.prior_files = prior.files.filter((file) => TEXT_PATH.test(file.path))
    const response = await callAgent(config, request, root)
    assertSafeResponse(response, { phase, model: models[index], draftPr, dates }, config)
    spent += response.cost_usd
    if (spent > totalBudget) throw new Error(`agent spend ${spent} exceeds per-case cap ${config.maxCostUsd}`)
    prior = response
  }
  assertGenerationMetadata(prior, { dates, draftPr, models })
  writeSafeFiles(prior, root, { phase: 'legal_review', model: models[2], draftPr, dates }, config, { overwrite: false })
  process.stdout.write(`${JSON.stringify({ request_id: prior.request_id, spent_usd: spent, files: prior.files.length })}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => { console.error(`docket-case-agent: ${error.message}`); process.exitCode = 1 })
}
