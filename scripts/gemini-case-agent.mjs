import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const REVIEW_KEYS = {
  legal_review: ['legal_coherence', 'admissibility', 'burden', 'competent_record', 'sensitivity'],
  story_review: ['hook', 'both_sides', 'fair_reversal', 'specificity', 'listenability', 'discussion', 'originality', 'sensitivity'],
}

function stableHash(value) {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(value)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function parseModelJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const value = JSON.parse(clean)
  if (!Array.isArray(value.files) || value.files.length === 0) throw new Error('Gemini returned no case files')
  return value
}

function generatedIds(root, count) {
  const docket = join(root, 'site/app/docket')
  const maximum = Math.max(0, ...readdirSync(docket, { withFileTypes: true })
    .map(({ name }) => /^dd-(\d{4})(?:\.json)?$/.exec(name)?.[1])
    .filter(Boolean).map(Number))
  return Array.from({ length: count }, (_, index) => `dd-${String(maximum + index + 1).padStart(4, '0')}`)
}

function templateFiles(root) {
  const docket = join(root, 'site/app/docket')
  const id = readdirSync(docket, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^dd-\d{4}$/.test(entry.name))
    .map(({ name }) => name).sort().at(-1)
  if (!id) throw new Error('no V4 template bundle exists')
  return ['trial', 'analysis', 'legal-sheet', 'deliberation-pack'].map((name) => ({
    path: `site/app/docket/${id}/${name}.json`,
    content: readFileSync(join(docket, id, `${name}.json`), 'utf8'),
  }))
}

function currentFiles(root, dates) {
  const docket = join(root, 'site/app/docket')
  const files = []
  for (const entry of readdirSync(docket, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^dd-\d{4}$/.test(entry.name)) continue
    const trial = JSON.parse(readFileSync(join(docket, entry.name, 'trial.json'), 'utf8'))
    if (!dates.includes(trial.publish_date)) continue
    for (const name of ['trial', 'analysis', 'legal-sheet', 'deliberation-pack']) {
      files.push({ path: `site/app/docket/${entry.name}/${name}.json`, content: readFileSync(join(docket, entry.name, `${name}.json`), 'utf8') })
    }
  }
  return files
}

function promptFor(request, root) {
  const prior = request.prior_files ?? (request.phase === 'repair' ? currentFiles(root, request.dates) : undefined)
  const reference = prior ?? templateFiles(root)
  const priorIds = [...new Set(prior?.map(({ path }) => /^site\/app\/docket\/(dd-\d{4})\//.exec(path)?.[1]).filter(Boolean) ?? [])].sort()
  const ids = priorIds.length === request.dates.length ? priorIds : generatedIds(root, request.dates.length)
  const role = request.phase === 'draft'
    ? 'Create a wholly original, serious and enthralling fictional criminal trial. Do not copy the reference story.'
    : request.phase === 'legal_review'
      ? 'Independently audit and revise every legal, evidential, admissibility, burden and sensitivity detail.'
      : request.phase === 'story_review'
        ? 'Independently audit and revise hook, fairness, specificity, listenability, originality and discussion value.'
        : 'Implement or explicitly disposition every supplied review thread without weakening any gate.'
  return `${role}

Return JSON only: {"files":[{"path":"...","content":"complete JSON text"}],"review":{"approved":true,"checks":{...}}}.
Return exactly four UTF-8 files per sitting: trial.json, analysis.json, legal-sheet.json and deliberation-pack.json. No media bytes.
Targets: ${request.dates.map((date, i) => `${ids[i]}=${date}`).join(', ')}. Reserved PR: ${request.draft_pr}.
Preserve the reference bundle's exact schemas and depth, but replace every case-specific fact, name, issue and utterance tests. Use State of Orinth. Every trial must be V4, fiction-labelled, non-graphic, balanced, current, and computed for 19-21 minutes. Include complete media declarations for cover, accused, every cast member, all 11 jurors, and 2-3 useful beats. Use only /today/media/<target-id>/ paths. Leave revision and approval hashes as placeholders; trusted code rebinds them.
Editorial checks required: ${JSON.stringify(REVIEW_KEYS[request.phase] ?? [])}.
Feedback: ${JSON.stringify(request.feedback ?? null)}
Authorities: ${JSON.stringify(request.authority_documents ?? {})}
Reference/revision input: ${JSON.stringify(reference)}`
}

async function postGemini(key, model, body, attempts, fetchImpl) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(20 * 60 * 1000),
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (response.ok || (response.status !== 429 && response.status < 500) || attempt === attempts) return response
  }
}

async function geminiJson(key, model, prompt, maxTokens, attempts, fetchImpl) {
  const response = await postGemini(key, model, {
    contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
  }, attempts, fetchImpl)
  if (!response.ok) throw new Error(`Gemini ${model} returned HTTP ${response.status}`)
  const body = await response.json()
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
  if (!text) throw new Error(`Gemini ${model} returned no JSON text`)
  const usage = body.usageMetadata ?? {}
  return { value: parseModelJson(text), cost: ((usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0)) * 0.00003 }
}

function rebind(files, request, config) {
  const byName = new Map(files.map((file) => [file.path, JSON.parse(file.content)]))
  const trialPaths = [...byName.keys()].filter((path) => path.endsWith('/trial.json')).sort()
  if (trialPaths.length !== request.dates.length) throw new Error('Gemini must return one trial bundle per date')
  trialPaths.forEach((trialPath, index) => {
    const root = trialPath.slice(0, -'/trial.json'.length)
    const id = basename(root)
    const trial = byName.get(trialPath)
    trial.id = id
    trial.publish_date = request.dates[index]
    trial.gen_meta = { model: config.models[0], prompt_version: 'dd-2026-v4', reviewer: `${config.models[1]} independent legal review`, batch_pr: String(request.draft_pr), language_reviewer: `${config.models[2]} independent story review`, sensitivity_reviewer: `${config.models[1]} and ${config.models[2]}` }
    const revision = `${id}@${stableHash(trial)}`
    const analysis = byName.get(`${root}/analysis.json`)
    const legal = byName.get(`${root}/legal-sheet.json`)
    const pack = byName.get(`${root}/deliberation-pack.json`)
    if (!analysis || !legal || !pack) throw new Error(`incomplete Gemini bundle for ${id}`)
    for (const value of [analysis, legal, pack]) { value.case_id = id; value.case_revision = revision }
    const legalContent = Object.fromEntries(Object.entries(legal).filter(([key]) => key !== 'approvals'))
    const approvalHash = `${revision}@legal-${stableHash(legalContent)}`
    const approvedAt = new Date().toISOString()
    legal.approvals = Object.fromEntries(['legal', 'read_aloud', 'blind_test'].map((name) => [name, { status: 'approved', reviewer: name === 'legal' ? config.models[1] : config.models[2], approved_at: approvedAt, content_hash: approvalHash }]))
  })
  return [...byName].map(([path, value]) => ({ type: 'file', path, encoding: 'utf8', content: `${JSON.stringify(value, null, 2)}\n` }))
}

function mediaManifest(files) {
  const output = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.src === 'string' && node.src.startsWith('/today/media/')) output.push({ path: `site/app/public${node.src.slice(6)}`, prompt: `${node.alt}. ${node.caption}. Kind: ${node.kind}.` })
    else for (const child of Object.values(node)) visit(child)
  }
  for (const file of files.filter(({ path }) => path.endsWith('/trial.json'))) visit(JSON.parse(file.content).media)
  return [...new Map(output.map((item) => [item.path, item])).values()]
}

async function imageFile(key, model, asset, attempts, fetchImpl, convert) {
  const style = asset.path.includes('/beats/') ? 'ambiguous contemporary evidence reconstruction, no readable text' : asset.path.endsWith('/cover.webp') ? 'juror-eye contemporary charcoal and ink court sketch, selective watercolor' : 'individual contemporary courtroom portrait, charcoal and ink, natural expression'
  const response = await postGemini(key, model, { contents: [{ parts: [{ text: `Fictional people and events. ${style}. ${asset.prompt} No logo, watermark, public figure, wig, gavel, gore, sepia, or verdict signalling.` }] }], generationConfig: { responseModalities: ['IMAGE'], responseFormat: { image: { aspectRatio: '3:2', imageSize: '1K' } } } }, attempts, fetchImpl)
  if (!response.ok) throw new Error(`Gemini image model returned HTTP ${response.status}`)
  const body = await response.json()
  const part = body.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data)
  if (!part) throw new Error('Gemini image model returned no image')
  const webp = convert(Buffer.from(part.inlineData.data, 'base64'))
  return { type: 'file', path: asset.path, encoding: 'base64', content: webp.toString('base64') }
}

export function convertToWebp(input) {
  const dir = mkdtempSync(join(tmpdir(), 'simjury-gemini-image-'))
  try {
    const source = join(dir, 'source.img'); const target = join(dir, 'asset.webp')
    writeFileSync(source, input)
    const result = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-q:v', '78', target])
    if (result.status !== 0) throw new Error(`ffmpeg WebP conversion failed: ${result.stderr?.toString().trim()}`)
    return readFileSync(target)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

export async function callGeminiCaseAgent(config, request, root, { fetchImpl = fetch, convert = convertToWebp } = {}) {
  const basePrompt = promptFor(request, root)
  let generated
  let correction = ''
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const result = await geminiJson(config.token, request.model, `${basePrompt}${correction}`, config.maxTokens, 1, fetchImpl)
      const files = rebind(result.value.files, request, config)
      if (REVIEW_KEYS[request.phase]?.some((key) => result.value.review?.approved !== true || result.value.review.checks?.[key] !== true)) throw new Error(`${request.phase} must approve every required check`)
      if (Buffer.byteLength(JSON.stringify(files)) > config.maxOutputBytes) throw new Error('Gemini text bundle exceeds output byte cap')
      generated = { ...result, files }
      break
    } catch (error) {
      if (attempt === config.maxAttempts) throw error
      correction = `\nYour previous response was rejected by trusted validation: ${error.message}. Return a complete corrected response.`
    }
  }
  let files = generated.files
  let totalCost = generated.cost
  if (request.phase === 'story_review' || request.phase === 'repair') {
    const assets = mediaManifest(files)
    if (assets.length > config.maxImagesPerCase * request.dates.length) throw new Error('Gemini media manifest exceeds image cap')
    if (totalCost + assets.length * 0.25 > request.limits.remaining_cost_usd) throw new Error('Gemini generation would exceed cost cap')
    const images = []
    for (const asset of assets) {
      let image
      for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
        try { image = await imageFile(config.token, config.imageModel, asset, 1, fetchImpl, convert); break }
        catch (error) {
          if (attempt === config.maxAttempts) throw error
          asset.prompt += ` Previous output was rejected: ${error.message}. Return one valid image.`
        }
      }
      images.push(image)
    }
    files = [...files, ...images]
    totalCost += assets.length * 0.25
  }
  return { schema: 'simjury.case-agent/v1', phase: request.phase, model: request.model, provider: config.provider, image_model: config.imageModel, image_license: config.imageLicense, draft_pr: request.draft_pr, dates: request.dates, request_id: `gemini-${request.draft_pr}-${request.phase}`, cost_usd: totalCost, files, review: generated.value.review, dispositions: generated.value.dispositions }
}
