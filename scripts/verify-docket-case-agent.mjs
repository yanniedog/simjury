import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertDispositions, assertGenerationMetadata, assertSafeResponse, assertWebpStructure, boundedJson, readConfig, requestIdempotencyKey, writeSafeFiles } from './docket-case-agent.mjs'
import { resumeCandidate, unreservedDates } from './docket-commission-plan.mjs'
import { callGeminiCaseAgent } from './gemini-case-agent.mjs'

const env = {
  CASE_GENERATION_ENABLED: 'true', CASE_AGENT_ENDPOINT: 'https://agent.invalid/generate', CASE_AGENT_TOKEN: 'secret',
  CASE_AGENT_PROVIDER: 'example-provider', CASE_IMAGE_MODEL: 'image-1', CASE_IMAGE_LICENSE: 'provider-output-terms-v1',
  CASE_DRAFT_MODEL: 'draft-1', CASE_LEGAL_REVIEW_MODEL: 'legal-1', CASE_STORY_REVIEW_MODEL: 'story-1',
  CASE_MAX_ATTEMPTS: '2', CASE_MAX_REPAIR_ATTEMPTS: '2', CASE_MAX_IMAGES_PER_CASE: '24',
  CASE_MAX_OUTPUT_BYTES: '20000000', CASE_MAX_COST_USD: '25', CASE_MAX_TOKENS: '50000',
}
const config = readConfig(env)
const expected = { phase: 'story_review', model: 'story-1', draftPr: 321, dates: ['2026-08-08'] }
const response = {
  schema: 'simjury.case-agent/v1', phase: 'story_review', model: 'story-1', draft_pr: 321,
  provider: 'example-provider', image_model: 'image-1', image_license: 'provider-output-terms-v1',
  dates: ['2026-08-08'], request_id: 'req-1', cost_usd: 4.25,
  review: { approved: true, checks: { hook: true, both_sides: true, fair_reversal: true, specificity: true, listenability: true, discussion: true, originality: true, sensitivity: true } },
  files: [
    { type: 'file', path: 'site/app/docket/dd-0042.json', encoding: 'utf8', content: '{"label":"fiction"}' },
    { type: 'file', path: 'site/app/public/media/dd-0042/cover.webp', encoding: 'base64', content: Buffer.from('5249464612000000574542505650384c050000002f0000000000', 'hex').toString('base64') },
  ],
}

assert.equal(config.enabled, true)
assert.deepEqual(config.missing, [])
assert.equal(readConfig({ CASE_GENERATION_ENABLED: 'false' }).missing.length, 14)
assert.equal(readConfig({
  CASE_GENERATION_ENABLED: 'false',
  CASE_MAX_ATTEMPTS: '', CASE_MAX_REPAIR_ATTEMPTS: '', CASE_MAX_IMAGES_PER_CASE: '',
  CASE_MAX_OUTPUT_BYTES: '', CASE_MAX_COST_USD: '', CASE_MAX_TOKENS: '',
}).missing.length, 14, 'empty GitHub variables must be reported as missing, not parsed as zero')
assert.throws(() => readConfig({ ...env, CASE_STORY_REVIEW_MODEL: 'legal-1' }), /must be distinct/)
assert.throws(() => readConfig({ ...env, CASE_AGENT_ENDPOINT: 'http://agent.invalid' }), /must use HTTPS/)
assert.deepEqual(assertSafeResponse(response, expected, config).paths, response.files.map((file) => file.path))

const root = mkdtempSync(join(tmpdir(), 'simjury-case-agent-'))
writeSafeFiles(response, root, expected, config)
assert.equal(readFileSync(join(root, 'site/app/docket/dd-0042.json'), 'utf8'), '{"label":"fiction"}')
assert.throws(() => writeSafeFiles(response, root, expected, config, { overwrite: false }), /may not overwrite/)

const rejected = (patch, pattern) => assert.throws(
  () => assertSafeResponse({ ...response, ...patch }, expected, config), pattern,
)
rejected({ draft_pr: 999 }, /reserved draft PR/)
rejected({ dates: ['2026-08-09'] }, /dates changed/)
rejected({ model: 'unreviewed-model' }, /unexpected model/)
rejected({ review: { approved: false, checks: {} } }, /did not approve/)
rejected({ files: [{ type: 'file', path: '../workflow.yml', content: 'x' }] }, /unsafe artifact path/)
rejected({ files: [{ type: 'symlink', path: 'site/app/docket/dd-0042.json', content: 'x' }] }, /regular file/)
rejected({ files: [{ type: 'file', path: '.github/workflows/pwn.yml', content: 'x' }] }, /outside case allowlist/)
rejected({ files: [{ type: 'file', path: 'site/app/docket/dd-0042.json', content: '{"command":"curl bad"}' }] }, /command-like key/)
rejected({ files: [{ type: 'file', path: 'site/app/docket/dd-0042.json', content: 'not-json' }] }, /invalid generated JSON/)
rejected({ files: Array.from({ length: 25 }, (_, index) => ({
  type: 'file', path: `site/app/public/media/dd-0042/characters/p-${index}.webp`,
  encoding: 'base64', content: response.files[1].content,
})) }, /image.*cap/)

assert.doesNotThrow(() => assertWebpStructure(Buffer.from(response.files[1].content, 'base64')))
assert.throws(() => assertWebpStructure(Buffer.from('RIFF0000WEBP')), /structured WebP/)
const emptyAnimation = Buffer.alloc(36)
emptyAnimation.write('RIFF'); emptyAnimation.writeUInt32LE(28, 4); emptyAnimation.write('WEBP', 8)
emptyAnimation.write('ANMF', 12); emptyAnimation.writeUInt32LE(16, 16)
assert.throws(() => assertWebpStructure(emptyAnimation), /no complete image data/)
assert.equal(requestIdempotencyKey({ draft_pr: 321, phase: 'repair', repair_attempt: 1 }, 'repo'), 'repo:321:repair:1')
assert.equal(requestIdempotencyKey({ draft_pr: 321, phase: 'repair', repair_attempt: 2 }, 'repo'), 'repo:321:repair:2')

const linkedRoot = mkdtempSync(join(tmpdir(), 'simjury-case-agent-link-'))
mkdirSync(join(linkedRoot, 'site/app'), { recursive: true })
symlinkSync(tmpdir(), join(linkedRoot, 'site/app/docket'), 'junction')
assert.throws(() => writeSafeFiles(response, linkedRoot, expected, config), /symlink parent rejected/)

const feedback = { threads: [{ id: 'T1' }, { id: 'T2' }] }
assert.doesNotThrow(() => assertDispositions({ dispositions: [
  { thread_id: 'T1', status: 'Implemented', reason: 'Corrected the cited legal direction.' },
  { thread_id: 'T2', status: 'Declined', reason: 'The proposed fact is outside the admissible record.' },
] }, feedback))
assert.throws(() => assertDispositions({ dispositions: [
  { thread_id: 'T1', status: 'Implemented', reason: 'done' },
] }, feedback), /every unresolved thread/)

const provenance = structuredClone(response)
provenance.files[0].content = JSON.stringify({ gen_meta: {
  model: 'draft-1', prompt_version: 'dd-2026-v4', batch_pr: '321', reviewer: 'legal-1 legal pass',
  language_reviewer: 'story-1 language pass', sensitivity_reviewer: 'story-1 sensitivity pass',
}, publish_date: '2026-08-08', media: { cover: { src: '/today/media/dd-0042/cover.webp' } } })
assert.doesNotThrow(() => assertGenerationMetadata(provenance, { dates: ['2026-08-08'], draftPr: 321, models: config.models }))
assert.throws(() => assertGenerationMetadata(response, { dates: ['2026-08-08'], draftPr: 321, models: config.models }), /gen_meta/)

const workflow = readFileSync(new URL('../.github/workflows/docket-supply.yml', import.meta.url), 'utf8')
for (const contract of [
  'schedule:', 'workflow_dispatch:', 'pull_request_review:', 'pull_request_review_comment:',
  'CASE_GENERATION_ENABLED', 'actions/create-github-app-token@v3', 'gh pr create --draft',
  'docket-case-agent.mjs generate', 'docket-case-agent.mjs repair', 'synthesize-kokoro-clips.sh',
  'npm run lint && npm run typecheck && npm test && npm run validate:cases && npm run build',
  'blocked_configuration', 'blocked_automation',
]) assert.ok(workflow.includes(contract), `workflow contract missing: ${contract}`)
assert.ok(workflow.includes("if $missing==\"\" then []"), 'configured issue state must still emit valid JSON')
assert.ok(workflow.includes('app-id: ${{ vars.CASE_BOT_APP_ID }}'), 'GitHub App token action must receive its required app-id')
assert.ok(workflow.includes('INVALID_CASE_CONFIGURATION'), 'malformed configuration must produce a durable blocked record')
assert.ok(workflow.includes('git status --porcelain=v1 --untracked-files=all'), 'V4 bundle containment must inspect individual untracked files')
assert.ok(workflow.includes('pageInfo{hasNextPage endCursor}'), 'review thread collection must paginate')
assert.ok(workflow.includes('[ "$status" = Deferred ] || gh api graphql'), 'deferred repair work must remain unresolved and blocking')
assert.ok(workflow.includes('Synthesize repaired Kokoro narration'), 'repairs to spoken content must regenerate narration')
assert.ok(workflow.indexOf('Synthesize Kokoro narration') < workflow.indexOf('id: publish-token'), 'a fresh App token must be minted after long-running synthesis')
assert.ok(workflow.indexOf('gh pr create --draft') < workflow.indexOf('docket-case-agent.mjs generate'), 'draft PR must be reserved before generation')
assert.ok(workflow.indexOf('Run the complete deterministic merge bar') < workflow.indexOf('Publish validated Kokoro narration'), 'deterministic validation must precede narration publication')
assert.equal(workflow.includes('--watch'), false, 'controller must never busy-poll')
assert.equal(/gh pr merge/.test(workflow), false, 'controller must not bypass arm-and-park')
assert.ok(workflow.includes("github.event.pull_request.head.repo.full_name == github.repository"), 'review events must fail closed for fork PRs')
assert.ok(workflow.includes("contains(github.event.pull_request.labels.*.name, 'docket-generation')"), 'review events must require the docket-generation label')
assert.equal(workflow.includes('actions: write'), false, 'controller must not request unused Actions write permission')
assert.ok(workflow.includes("group: docket-supply-${{ github.event.pull_request.number || 'commission' }}"), 'unrelated PR repairs must not share a global concurrency lock')
assert.ok(workflow.includes('gh pr view "$EVENT_PR"'), 'review events must resume their triggering PR')
assert.ok(workflow.includes('gh pr list --state open --base main --label docket-generation'), 'scheduled commissions must inspect only default-branch generation PRs')
assert.deepEqual(unreservedDates(
  ['2026-08-08', '2026-08-09', '2026-08-10'],
  [{ dates: ['2026-08-08'] }, { dates: ['2026-08-09', '2026-08-09'] }],
), ['2026-08-10'], 'new UTC dates must remain commissionable while older PRs wait')
assert.deepEqual(resumeCandidate([
  { phase: 'awaiting_review', pull_request: 20 },
  { phase: 'reserved', pull_request: 19 },
]), { phase: 'reserved', pull_request: 19 }, 'a stranded reservation must resume on a later supply run')
const supply = readFileSync(new URL('../site/app/scripts/docket-supply.ts', import.meta.url), 'utf8')
assert.ok(supply.includes('if (files.errors.length)'), 'supply measurement must fail on malformed or incomplete V4 bundles')
const narration = readFileSync(new URL('../site/scripts/build-kokoro-jobs.mjs', import.meta.url), 'utf8')
const narrationDiscovery = readFileSync(new URL('../site/scripts/docket-trials.mjs', import.meta.url), 'utf8')
assert.ok(
  narration.includes('listDocketTrialIds(docketDir)') &&
    narrationDiscovery.includes("join(docketDir, entry.name, 'trial.json')"),
  'Kokoro must discover V4 trial bundles',
)
await assert.rejects(() => boundedJson(new Response('{"too":"large"}'), 4), /exceeds byte cap/)
assert.deepEqual(await boundedJson(new Response('{"ok":true}'), 64), { ok: true })

const geminiRoot = join(import.meta.dirname, '..')
const geminiFiles = [
  ['trial', { id: 'placeholder', publish_date: '2000-01-01', media: { cover: { src: '/today/media/dd-0043/cover.webp', alt: 'A neutral courtroom scene', caption: 'Fictional court sketch', kind: 'court_sketch' } } }],
  ['analysis', {}], ['legal-sheet', { approvals: {} }], ['deliberation-pack', {}],
].map(([name, value]) => ({ path: `site/app/docket/dd-0043/${name}.json`, content: JSON.stringify(value) }))
const geminiReply = (phase, model, withReview = false) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: JSON.stringify({
    files: geminiFiles,
    ...(withReview ? { review: { approved: true, checks: Object.fromEntries((phase === 'story_review' ? ['hook', 'both_sides', 'fair_reversal', 'specificity', 'listenability', 'discussion', 'originality', 'sensitivity'] : []).map((key) => [key, true])) } } : {}),
  }) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
}), { status: 200, headers: { 'content-type': 'application/json' } })
const geminiConfig = { ...config, endpoint: 'gemini://generateContent', token: 'gemini-secret', provider: 'google-gemini', imageModel: 'gemini-image', imageLicense: 'Google Gemini API output terms' }
const draftResult = await callGeminiCaseAgent(geminiConfig, {
  phase: 'draft', dates: ['2026-08-09'], draft_pr: 400, model: config.models[0],
  limits: { remaining_cost_usd: 25 }, authority_documents: {},
}, geminiRoot, { fetchImpl: async () => geminiReply('draft', config.models[0]) })
const reboundTrial = JSON.parse(draftResult.files.find(({ path }) => path.endsWith('/trial.json')).content)
assert.equal(reboundTrial.id, 'dd-0043')
assert.equal(reboundTrial.publish_date, '2026-08-09')
assert.equal(reboundTrial.gen_meta.batch_pr, '400')
assert.match(JSON.parse(draftResult.files.find(({ path }) => path.endsWith('/analysis.json')).content).case_revision, /^dd-0043@[a-f0-9]{8}$/)
let semanticCalls = 0
await assert.doesNotReject(() => callGeminiCaseAgent(geminiConfig, {
  phase: 'draft', dates: ['2026-08-09'], draft_pr: 400, model: config.models[0],
  limits: { remaining_cost_usd: 25 }, authority_documents: {},
}, geminiRoot, { fetchImpl: async () => (++semanticCalls === 1 ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{broken' }] } }] }), { status: 200 }) : geminiReply('draft', config.models[0])) }))
assert.equal(semanticCalls, 2, 'semantic validation errors must consume a bounded correction attempt')

let geminiCalls = 0
const storyResult = await callGeminiCaseAgent(geminiConfig, {
  phase: 'story_review', dates: ['2026-08-09'], draft_pr: 400, model: config.models[2], prior_files: geminiFiles,
  limits: { remaining_cost_usd: 25 }, authority_documents: {},
}, geminiRoot, { fetchImpl: async () => (++geminiCalls === 1 ? geminiReply('story_review', config.models[2], true) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'aW1hZ2U=' } }] } }] }), { status: 200 })), convert: () => Buffer.from(response.files[1].content, 'base64') })
assert.equal(storyResult.files.filter(({ encoding }) => encoding === 'base64').length, 1)
assert.equal(geminiCalls, 2)
assert.doesNotThrow(() => assertWebpStructure(Buffer.from(storyResult.files.find(({ encoding }) => encoding === 'base64').content, 'base64')))

console.log('docket-case-agent: all contract and containment assertions passed')
