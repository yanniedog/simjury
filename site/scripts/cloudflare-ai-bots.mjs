#!/usr/bin/env node
/**
 * Audit / apply Cloudflare edge policy so LLM chat fetchers (Agent + Search)
 * can reach simjury.com public surfaces without challenges, while training
 * preference stays aligned with site robots.txt (ai-train=no).
 *
 * Required token scopes (zone simjury.com):
 *   - Bot Management Read  (audit)
 *   - Bot Management Edit  (apply) — dashboard label may say "Write"
 *   - Zone WAF Read / Edit (audit / optional assistant skip rule)
 *
 * Does not change the assets-only application architecture.
 *
 * Usage:
 *   node scripts/cloudflare-ai-bots.mjs audit
 *   node scripts/cloudflare-ai-bots.mjs apply
 *   node scripts/cloudflare-ai-bots.mjs apply --dry-run
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://api.cloudflare.com/client/v4'
const ZONE_NAME = 'simjury.com'
const ZONE_ID = 'b846e0538072105249dd2d42ce55909f'
const ACCOUNT_ID = 'f3250f7113cfd8c7f747a09f942ca6d0'
const DASH_SECURITY =
  `https://dash.cloudflare.com/${ACCOUNT_ID}/${ZONE_NAME}/security/settings`
const DASH_TOKEN =
  'https://dash.cloudflare.com/profile/api-tokens'

/** Desired Free-plan Bot Fight Mode configuration (legacy API fields). */
const DESIRED_BOT_MANAGEMENT = Object.freeze({
  // Legacy "Block AI bots" off so Agent/Search chat fetch is not edge-blocked.
  // Granular Training=Block remains a dashboard AI bot policy (see fail-closed notes).
  ai_bots_protection: 'disabled',
  fight_mode: false,
  // Site-owned robots.txt must win (Claude-User allow, training UAs disallow).
  is_robots_txt_managed: false,
})

/** Assistant / AI-search UAs we may skip Bot Fight Mode for if fight_mode must stay on. */
const ASSISTANT_UA_SKIP_DESCRIPTION = 'simjury: skip bot fight for LLM assistant fetchers (public only)'
// Agent + Search fetchers only — never training crawlers (GPTBot, ClaudeBot, etc.).
const ASSISTANT_UA_SKIP_EXPRESSION = [
  '(not starts_with(http.request.uri.path, "/api/"))',
  'and (not starts_with(http.request.uri.path, "/discord/"))',
  'and (',
  [
    'http.user_agent contains "Claude-User"',
    'http.user_agent contains "Claude-SearchBot"',
    'http.user_agent contains "ChatGPT-User"',
    'http.user_agent contains "OAI-SearchBot"',
    'http.user_agent contains "Codex"',
    'http.user_agent contains "Kimi-User"',
    'http.user_agent contains "DeepSeek-User"',
  ].join(' or '),
  ')',
].join(' ')

const BOT_FIELDS = [
  'ai_bots_protection',
  'content_bots_protection',
  'crawler_protection',
  'cf_robots_variant',
  'fight_mode',
  'is_robots_txt_managed',
  'enable_js',
  'sbfm_definitely_automated',
  'sbfm_likely_automated',
  'sbfm_verified_bots',
  'sbfm_static_resource_protection',
]

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function usage() {
  fail(
    [
      'Usage: node scripts/cloudflare-ai-bots.mjs <audit|apply> [--dry-run]',
      '',
      'Environment: CLOUDFLARE_API_TOKEN (required)',
      'Optional:    CLOUDFLARE_ZONE_ID (defaults to simjury.com production zone)',
    ].join('\n'),
    2,
  )
}

function requireToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  if (!token) {
    fail(
      [
        'CLOUDFLARE_API_TOKEN is missing.',
        '',
        ...permissionGapLines('token missing'),
      ].join('\n'),
      3,
    )
  }
  return token
}

function permissionGapLines(reason) {
  return [
    `Cloudflare AI bot policy: cannot proceed (${reason}).`,
    '',
    'Token is missing Bot Management and/or Zone WAF access.',
    'Create or edit an API token at:',
    `  ${DASH_TOKEN}`,
    'Required zone permissions on simjury.com:',
    '  - Bot Management Read',
    '  - Bot Management Edit  (dashboard may label this Write)',
    '  - Zone WAF Read',
    '  - Zone WAF Edit        (only needed for optional assistant skip rule)',
    '  - Zone Read            (already present on the deploy token)',
    '',
    'Until the token can write, set the live policy in the dashboard:',
    `  ${DASH_SECURITY}`,
    'Exact clicks:',
    '  1. Security → Settings (or Security Settings)',
    '  2. Configure AI bot policies:',
    '       Agent  = Allow (do not block)',
    '       Search = Allow (do not block)',
    '       Training = Block (on all pages)  — matches site robots ai-train=no',
    '  3. Bot Fight Mode = Off',
    '     (Preferred: AI fetchers never pass JS challenges; site CSP also',
    '      omits /cdn-cgi/challenge-platform/.)',
    '  4. Managed robots.txt for AI crawlers = Off',
    '     (Keep site/public/robots.txt authoritative.)',
    '  5. Do not add WAF allows that cover /api/* or /discord/*.',
  ]
}

async function cfFetch(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { success: false, errors: [{ message: text.slice(0, 400) }] }
  }
  return { status: response.status, ok: response.ok, json, text }
}

function isAuthFailure(status, json) {
  if (status === 401 || status === 403) return true
  const code = json?.errors?.[0]?.code
  return code === 10000 || code === 9109
}

function pickBotFields(result) {
  if (!result || typeof result !== 'object') return null
  const out = {}
  for (const key of BOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(result, key)) out[key] = result[key]
  }
  if (result.stale_zone_configuration) {
    out.stale_zone_configuration = result.stale_zone_configuration
  }
  return out
}

function compareDesired(current) {
  const gaps = []
  for (const [key, want] of Object.entries(DESIRED_BOT_MANAGEMENT)) {
    const got = current?.[key]
    if (got !== want) {
      gaps.push(`${key}: have ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
    }
  }
  return gaps
}

function filterAiRules(rules) {
  return (rules ?? []).filter((rule) => {
    const hay = `${rule.description ?? ''}\n${rule.expression ?? ''}`.toLowerCase()
    return /ai|bot|crawl|agent|anthropic|claude|openai|chatgpt|gptbot|kimi|deepseek/.test(hay)
  }).map((rule) => ({
    id: rule.id,
    action: rule.action,
    enabled: rule.enabled,
    description: rule.description,
    expression: rule.expression,
    ref: rule.ref,
  }))
}

function warnIfApiWeakened(rules) {
  const bad = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    const expr = (rule.expression ?? '').toLowerCase()
    const skipsApi =
      expr.includes('/api/')
      && (rule.action === 'skip' || rule.action === 'allow' || rule.action === 'bypass')
    if (skipsApi) {
      bad.push(
        `WAF rule ${rule.id ?? rule.ref ?? '(unknown)'} appears to skip/allow /api/: ${rule.description ?? rule.expression}`,
      )
    }
  }
  return bad
}

function readSiteRobotsSummary() {
  const robots = readFileSync(join(siteRoot, 'public', 'robots.txt'), 'utf8')
  const allowsAgents = /User-agent:\s*Claude-User/i.test(robots)
    && /User-agent:\s*Claude-SearchBot/i.test(robots)
  const blocksTraining = /User-agent:\s*GPTBot/i.test(robots)
    && /User-agent:\s*ClaudeBot/i.test(robots)
    && /Disallow:\s*\//.test(robots)
  const protectsApi = /Disallow:\s*\/api\//i.test(robots)
  return { allowsAgents, blocksTraining, protectsApi }
}

async function resolveZoneId(token) {
  const override = process.env.CLOUDFLARE_ZONE_ID?.trim()
  if (override) return override

  const { status, json } = await cfFetch(
    token,
    'GET',
    `/zones?name=${encodeURIComponent(ZONE_NAME)}`,
  )
  if (!json?.success || !Array.isArray(json.result) || json.result.length !== 1) {
    if (isAuthFailure(status, json)) {
      fail(permissionGapLines(`zones lookup HTTP ${status}`).join('\n'), 3)
    }
    fail(`Expected one ${ZONE_NAME} zone; got HTTP ${status}: ${JSON.stringify(json?.errors ?? json)}`)
  }
  const id = json.result[0].id
  if (id !== ZONE_ID) {
    console.error(`Warning: zone id ${id} differs from expected production id ${ZONE_ID}`)
  }
  return id
}

async function getBotManagement(token, zoneId) {
  return cfFetch(token, 'GET', `/zones/${zoneId}/bot_management`)
}

async function putBotManagement(token, zoneId, body) {
  return cfFetch(token, 'PUT', `/zones/${zoneId}/bot_management`, body)
}

async function getAiAuditRobots(token, zoneId) {
  return cfFetch(
    token,
    'GET',
    `/zones/${zoneId}/ai-audit/robots?subdomain=${encodeURIComponent(ZONE_NAME)}`,
  )
}

async function getCustomFirewall(token, zoneId) {
  return cfFetch(
    token,
    'GET',
    `/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`,
  )
}

function printSection(title, value) {
  console.log(`\n=== ${title} ===`)
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

async function audit(token, zoneId) {
  const robotsPolicy = readSiteRobotsSummary()
  printSection('site robots.txt expectations', {
    allows_assistant_agents: robotsPolicy.allowsAgents,
    blocks_training_uas: robotsPolicy.blocksTraining,
    protects_api: robotsPolicy.protectsApi,
    note: 'Edge policy must allow Agent+Search fetch; Training may stay blocked.',
  })

  const bot = await getBotManagement(token, zoneId)
  if (isAuthFailure(bot.status, bot.json)) {
    fail(permissionGapLines(`bot_management GET HTTP ${bot.status}`).join('\n'), 3)
  }
  if (!bot.json?.success) {
    fail(`bot_management GET failed HTTP ${bot.status}: ${JSON.stringify(bot.json?.errors ?? bot.json)}`)
  }
  const current = pickBotFields(bot.json.result)
  printSection('bot_management (live)', current)

  const gaps = compareDesired(current)
  printSection('desired bot_management deltas', gaps.length ? gaps : ['aligned with DESIRED_BOT_MANAGEMENT'])

  const aiRobots = await getAiAuditRobots(token, zoneId)
  if (isAuthFailure(aiRobots.status, aiRobots.json)) {
    printSection('ai-audit/robots', {
      status: aiRobots.status,
      error: 'permission denied — need Bot Management Read (or AI Crawl Control access)',
      body: aiRobots.json,
    })
  } else {
    printSection('ai-audit/robots', aiRobots.json)
  }

  const waf = await getCustomFirewall(token, zoneId)
  let aiRules = []
  if (isAuthFailure(waf.status, waf.json)) {
    printSection('WAF custom rules (AI/bot filter)', {
      status: waf.status,
      error: 'permission denied — need Zone WAF Read',
      body: waf.json,
    })
  } else if (!waf.json?.success && waf.status === 404) {
    printSection('WAF custom rules (AI/bot filter)', { note: 'no custom firewall entrypoint (empty)' })
  } else if (!waf.json?.success) {
    printSection('WAF custom rules (AI/bot filter)', {
      status: waf.status,
      errors: waf.json?.errors ?? waf.json,
    })
  } else {
    aiRules = filterAiRules(waf.json.result?.rules)
    printSection('WAF custom rules (AI/bot filter)', aiRules.length ? aiRules : [])
    const weakened = warnIfApiWeakened(waf.json.result?.rules ?? [])
    if (weakened.length) {
      printSection('WARNING: possible /api/* weakening', weakened)
    }
  }

  printSection('dashboard fallback (granular AI policies)', {
    url: DASH_SECURITY,
    agent: 'Allow',
    search: 'Allow',
    training: 'Block (on all pages)',
    fight_mode: 'Off',
    managed_robots_txt: 'Off',
  })

  if (gaps.length) {
    console.error('\nAudit: bot_management is NOT aligned with the desired LLM-access policy.')
    console.error('Run: npm run cloudflare:ai-bots:apply')
    console.error('(Or set the dashboard AI bot policies listed above.)')
    return 4
  }

  console.log('\nAudit: legacy bot_management fields match desired LLM-access policy.')
  console.log('Still confirm dashboard AI bot policies: Agent=Allow, Search=Allow, Training=Block.')
  return 0
}

async function ensureAssistantSkipRule(token, zoneId, dryRun) {
  const waf = await getCustomFirewall(token, zoneId)
  if (isAuthFailure(waf.status, waf.json)) {
    console.error(
      'Cannot read/write WAF custom rules (need Zone WAF Edit). Skipping assistant UA skip rule.',
    )
    return { attempted: false, reason: 'waf-forbidden' }
  }

  // 404 = no entrypoint yet; Cloudflare creates on first PUT via rulesets API.
  // We only add a skip when fight_mode could not be turned off — caller decides.
  const rules = waf.json?.result?.rules ?? []
  const existing = rules.find((rule) => rule.description === ASSISTANT_UA_SKIP_DESCRIPTION)
  if (existing) {
    printSection('assistant skip rule', { status: 'already present', id: existing.id, enabled: existing.enabled })
    return { attempted: true, reason: 'exists', id: existing.id }
  }

  const rulesetId = waf.json?.result?.id
  if (!rulesetId) {
    console.error('No custom firewall ruleset id; not creating a new ruleset automatically.')
    return { attempted: false, reason: 'no-ruleset' }
  }

  // Skip Browser Integrity Check / Bot Fight Mode only — never blanket WAF bypass.
  // Paths already exclude /api/* and /discord/*.
  const newRule = {
    action: 'skip',
    action_parameters: {
      products: ['bic'],
    },
    description: ASSISTANT_UA_SKIP_DESCRIPTION,
    enabled: true,
    expression: ASSISTANT_UA_SKIP_EXPRESSION,
  }

  printSection('assistant skip rule (proposed)', newRule)
  if (dryRun) {
    return { attempted: true, reason: 'dry-run' }
  }

  // Prefer appending via rulesets rules endpoint when available.
  const put = await cfFetch(
    token,
    'POST',
    `/zones/${zoneId}/rulesets/${rulesetId}/rules`,
    newRule,
  )
  if (isAuthFailure(put.status, put.json)) {
    console.error('WAF rule create forbidden; leave fight_mode off instead.')
    return { attempted: true, reason: 'create-forbidden' }
  }
  if (!put.json?.success) {
    console.error(`WAF rule create failed HTTP ${put.status}: ${JSON.stringify(put.json?.errors ?? put.json)}`)
    return { attempted: true, reason: 'create-failed' }
  }
  printSection('assistant skip rule created', put.json.result)
  return { attempted: true, reason: 'created' }
}

async function apply(token, zoneId, dryRun) {
  const before = await getBotManagement(token, zoneId)
  if (isAuthFailure(before.status, before.json)) {
    fail(permissionGapLines(`bot_management GET HTTP ${before.status}`).join('\n'), 3)
  }
  if (!before.json?.success) {
    fail(`bot_management GET failed HTTP ${before.status}: ${JSON.stringify(before.json?.errors ?? before.json)}`)
  }

  const current = pickBotFields(before.json.result)
  printSection('bot_management before', current)
  printSection('bot_management apply payload', DESIRED_BOT_MANAGEMENT)

  if (dryRun) {
    printSection('dry-run', {
      would_put: DESIRED_BOT_MANAGEMENT,
      deltas: compareDesired(current),
      note: 'No API writes performed.',
    })
    console.error('\nDry-run complete. Re-run without --dry-run to apply when token allows.')
    // Still remind about granular dashboard policies.
    printSection('dashboard still required for granular policies', {
      url: DASH_SECURITY,
      agent: 'Allow',
      search: 'Allow',
      training: 'Block',
    })
    return compareDesired(current).length ? 4 : 0
  }

  const put = await putBotManagement(token, zoneId, DESIRED_BOT_MANAGEMENT)
  if (isAuthFailure(put.status, put.json)) {
    fail(permissionGapLines(`bot_management PUT HTTP ${put.status}`).join('\n'), 3)
  }
  if (!put.json?.success) {
    fail(`bot_management PUT failed HTTP ${put.status}: ${JSON.stringify(put.json?.errors ?? put.json)}`)
  }

  const afterFields = pickBotFields(put.json.result)
  printSection('bot_management after (PUT response)', afterFields)

  const readback = await getBotManagement(token, zoneId)
  if (!readback.json?.success) {
    fail(`bot_management readback failed HTTP ${readback.status}: ${JSON.stringify(readback.json?.errors ?? readback.json)}`)
  }
  const readbackFields = pickBotFields(readback.json.result)
  printSection('bot_management after (GET readback)', readbackFields)

  const gaps = compareDesired(readbackFields)
  if (gaps.length) {
    // If fight_mode refused to turn off, try a narrow assistant skip (never /api/*).
    if (readbackFields.fight_mode === true && DESIRED_BOT_MANAGEMENT.fight_mode === false) {
      console.error('fight_mode remained on after PUT; attempting public-only assistant UA skip rule.')
      await ensureAssistantSkipRule(token, zoneId, false)
    }
    fail(
      [
        'Apply did not fully align bot_management:',
        ...gaps.map((g) => `  - ${g}`),
        '',
        ...permissionGapLines('partial apply / plan limitation').slice(1),
      ].join('\n'),
      4,
    )
  }

  printSection('dashboard reminder (granular AI bot policies)', {
    url: DASH_SECURITY,
    note: 'API covers legacy ai_bots_protection + fight_mode + managed robots only.',
    set: {
      Agent: 'Allow',
      Search: 'Allow',
      Training: 'Block (on all pages)',
    },
  })

  console.log('\nApply: legacy bot_management fields aligned and verified by GET readback.')
  return 0
}

const argv = process.argv.slice(2)
const command = argv.find((arg) => !arg.startsWith('-'))
const dryRun = argv.includes('--dry-run')
if (!command || !['audit', 'apply'].includes(command)) usage()

const token = requireToken()
const zoneId = await resolveZoneId(token)
console.log(`Zone ${ZONE_NAME} (${zoneId}) — mode=${command}${dryRun ? ' dry-run' : ''}`)

const exitCode = command === 'audit'
  ? await audit(token, zoneId)
  : await apply(token, zoneId, dryRun)

process.exit(exitCode)
