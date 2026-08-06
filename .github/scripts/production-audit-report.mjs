import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export const trackerTitle = 'Production quality audit: simjury.com'
export const trackerMarker = '<!-- simjury-production-audit-tracker -->'

const sensitiveLine = /\b(?:localStorage|indexedDB|storageState|private notes?|ballots?|clipboard)\b/iu
const secretPattern = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/gu
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu
const localPathPattern = /(?:[A-Za-z]:\\(?:Users|Windows|runner|workspace)\\|\/(?:home|Users|private|tmp|runner|workspace)\/)[^\s"'<>]*/gu
const localPathLine = /(?:[A-Za-z]:\\(?:Users|Windows|runner|workspace)\\|\/(?:home|Users|private|tmp|runner|workspace)\/)/iu
const credentialLine = /^\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu

export function deidentify(raw) {
  const withoutStorage = raw.split(/\r?\n/u).map((line) => {
    if (sensitiveLine.test(line)) return '[redacted-browser-storage-line]'
    if (localPathLine.test(line)) return '[redacted-local-path-line]'
    if (credentialLine.test(line)) return '[redacted-credential-line]'
    return line
  }).join('\n')
  return withoutStorage
    .replace(/\bhttps?:\/\/[^\s<>"')\]]+/gu, (candidate) => {
      try {
        const parsed = new URL(candidate)
        return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`
      } catch {
        return '[redacted-url]'
      }
    })
    .replace(/\b(?:authorization|cookie|set-cookie|token|secret|password)\s*[:=]\s*\S+/giu, '[redacted-credential]')
    .replace(secretPattern, '[redacted-secret]')
    .replace(emailPattern, '[redacted-email]')
    .replace(ipv4Pattern, '[redacted-ip]')
    .replace(/\b(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]{1,}\b/giu, '[redacted-ip]')
    .replace(uuidPattern, '[redacted-id]')
    .replace(localPathPattern, '[redacted-local-path]')
}

export function assertDeidentified(value) {
  const forbidden = [secretPattern, emailPattern, ipv4Pattern, localPathPattern, localPathLine, sensitiveLine, credentialLine]
  for (const pattern of forbidden) {
    pattern.lastIndex = 0
    if (pattern.test(value)) throw new Error(`Deidentified audit still matches ${pattern}`)
  }
  for (const match of value.matchAll(/\bhttps?:\/\/[^\s<>"')\]]+/gu)) {
    const parsed = new URL(match[0])
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Deidentified audit contains URL credentials, query or fragment.')
    }
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${required('GITHUB_TOKEN')}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub API ${options.method ?? 'GET'} ${path} returned ${response.status} ${response.statusText}`)
  }
  return response.status === 204 ? null : response.json()
}

async function trackerIssue() {
  const repository = required('GITHUB_REPOSITORY')
  for (let page = 1; ; page += 1) {
    const issues = await github(`/repos/${repository}/issues?state=all&per_page=100&page=${page}`)
    const match = issues.find((issue) => !issue.pull_request
      && issue.user?.login === 'github-actions[bot]'
      && issue.title === trackerTitle
      && issue.body?.includes(trackerMarker))
    if (match) return match
    if (issues.length < 100) return null
  }
}

async function alreadyReported(issue, marker) {
  if (!issue) return false
  const repository = required('GITHUB_REPOSITORY')
  for (let page = 1; ; page += 1) {
    const comments = await github(`/repos/${repository}/issues/${issue.number}/comments?per_page=100&page=${page}`)
    if (comments.some((comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(marker))) return true
    if (comments.length < 100) return false
  }
}

async function setOutput(name, value) {
  const output = process.env.GITHUB_OUTPUT
  if (output) await appendFile(output, `${name}=${value}\n`)
  else console.log(`${name}=${value}`)
}

async function check() {
  const sha = required('AUDIT_SHA')
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error('AUDIT_SHA must be a full commit SHA')
  const issue = await trackerIssue()
  await setOutput('already_reported', String(await alreadyReported(issue, `<!-- simjury-production-audit:${sha} -->`)))
}

async function publish() {
  const repository = required('GITHUB_REPOSITORY')
  const sha = required('AUDIT_SHA')
  const marker = `<!-- simjury-production-audit:${sha} -->`
  let issue = await trackerIssue()
  if (await alreadyReported(issue, marker)) return
  if (!issue) {
    issue = await github(`/repos/${repository}/issues`, { method: 'POST', body: JSON.stringify({
      title: trackerTitle,
      body: `${trackerMarker}\nThis single issue records the independent, non-blocking audit run for each successfully deployed Court Week commit. No player data is collected.`,
    }) })
  } else if (issue.state !== 'open') {
    issue = await github(`/repos/${repository}/issues/${issue.number}`, {
      method: 'PATCH', body: JSON.stringify({ state: 'open' }),
    })
  }
  const summary = (await readFile(required('AUDIT_SUMMARY_PATH'), 'utf8')).slice(0, 45_000)
  let auditStatus = 'ERROR'
  try {
    const parsed = JSON.parse(await readFile(required('AUDIT_STATUS_PATH'), 'utf8'))
    if (['PASS', 'WARN', 'FAIL', 'BLOCKED'].includes(parsed.status)) auditStatus = parsed.status
  } catch { /* the command-level outcome below remains available */ }
  const paste = process.env.AUDIT_PASTE_URL && /^https:\/\/paste\.rs\/[A-Za-z0-9._-]+\/?$/u.test(process.env.AUDIT_PASTE_URL)
    ? process.env.AUDIT_PASTE_URL : null
  const body = [
    marker, `## Deployment \`${sha.slice(0, 12)}\``,
    '', `Audit result: **${auditStatus}** (command outcome: ${required('AUDIT_OUTCOME')})`,
    `- [Workflow run](${required('AUDIT_WORKFLOW_URL')})`,
    `- [GitHub-hosted deidentified evidence](${required('AUDIT_ARTIFACT_URL')})`,
    paste ? `- [Full deidentified terminal log](${paste})` : '- Paste upload unavailable; use the GitHub-hosted evidence link above.',
    '', '<details><summary>Quality and performance results</summary>', '', summary, '', '</details>',
  ].join('\n')
  await github(`/repos/${repository}/issues/${issue.number}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  })
}

async function redact(args) {
  if (args.length < 2) throw new Error('redact requires an output and at least one input')
  const combined = (await Promise.all(args.slice(1).map(async (path) => {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return `[audit source unavailable: ${basename(path)}]`
      throw error
    }
  }))).join('\n\n')
  const safe = deidentify(combined)
  assertDeidentified(safe)
  await mkdir(dirname(args[0]), { recursive: true })
  await writeFile(args[0], safe.endsWith('\n') ? safe : `${safe}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'redact') await redact(args)
  else if (command === 'check') await check()
  else if (command === 'publish') await publish()
  else throw new Error('Use redact, check or publish')
}
