import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'

export const COURT_WEEK_REVIEW_ROLES = [
  'prosecution',
  'defence',
  'judicial-neutrality',
  'accessibility',
  'sensitivity',
  'read-aloud',
  'blind-balance',
  'fixed-scope-criminal-law',
] as const

type ReviewRole = typeof COURT_WEEK_REVIEW_ROLES[number]
type ReviewDecision = 'pending' | 'approved'

export interface ReviewSignoffSource {
  schema: 'simjury.court-week-review-signoffs/v1'
  caseId: string
  revision: string
  contentDigest: string
  signoffs: Array<{ role: ReviewRole; decision: ReviewDecision }>
}

export interface ReviewSignoffReport {
  schema: 'simjury.court-week-review-report/v1'
  caseId: string
  revision: string
  contentDigest: string
  signoffRevision: string
  signoffDigest: string
  approvedRoles: ReviewRole[]
  pendingRoles: ReviewRole[]
  exactSourceMatch: boolean
  readyToPublish: boolean
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function courtWeekReviewDigest(): string {
  const exactReviewedSource = {
    revision: elevenMinutesCourtWeek.manifest.revision,
    trialRecord: elevenMinutesCourtWeek.trial,
    sessionPresentations: elevenMinutesCourtWeek.manifest.sessions,
    deliberationPack: elevenMinutesCourtWeek.deliberation,
  }
  return `sha256:${createHash('sha256').update(canonicalJson(exactReviewedSource)).digest('hex')}`
}

export function assessReviewSignoffs(source: ReviewSignoffSource): ReviewSignoffReport {
  if (source.schema !== 'simjury.court-week-review-signoffs/v1') throw new Error('Unsupported Court Week review signoff schema')
  const roles = source.signoffs.map(({ role }) => role)
  const expectedRoles = new Set<string>(COURT_WEEK_REVIEW_ROLES)
  if (roles.length !== expectedRoles.size || new Set(roles).size !== roles.length || roles.some((role) => !expectedRoles.has(role))) {
    throw new Error('Court Week review signoffs must contain each required role exactly once')
  }
  if (source.signoffs.some(({ decision }) => decision !== 'pending' && decision !== 'approved')) {
    throw new Error('Court Week review decisions must be pending or approved')
  }

  const contentDigest = courtWeekReviewDigest()
  const revision = elevenMinutesCourtWeek.manifest.revision
  const exactSourceMatch = source.caseId === elevenMinutesCourtWeek.manifest.id
    && source.revision === revision
    && source.contentDigest === contentDigest
  const approvedRoles = exactSourceMatch
    ? source.signoffs.filter(({ decision }) => decision === 'approved').map(({ role }) => role)
    : []
  const pendingRoles = COURT_WEEK_REVIEW_ROLES.filter((role) => !approvedRoles.includes(role))
  return {
    schema: 'simjury.court-week-review-report/v1',
    caseId: elevenMinutesCourtWeek.manifest.id,
    revision,
    contentDigest,
    signoffRevision: source.revision,
    signoffDigest: source.contentDigest,
    approvedRoles,
    pendingRoles,
    exactSourceMatch,
    readyToPublish: exactSourceMatch && pendingRoles.length === 0,
  }
}

export function requirePublishableReview(
  report: ReviewSignoffReport,
  expectedDigest?: string,
  expectedRevision?: string,
): void {
  if (expectedDigest && expectedDigest !== report.contentDigest) {
    throw new Error(`Reviewed media digest ${expectedDigest} does not match current source ${report.contentDigest}`)
  }
  if (expectedRevision && expectedRevision !== report.revision) {
    throw new Error(`Reviewed media revision ${expectedRevision} does not match current source ${report.revision}`)
  }
  if (!report.readyToPublish) {
    throw new Error(`Court Week publication blocked: pending exact-source signoffs: ${report.pendingRoles.join(', ')}`)
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

export function reportCourtWeekReviewSignoffs(options: {
  sourcePath?: string
  reportPath?: string
  requireApproved?: boolean
  expectedDigest?: string
  expectedRevision?: string
} = {}): ReviewSignoffReport {
  const sourcePath = resolve(options.sourcePath ?? 'content-reviews/cw-0001.review-signoffs.json')
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as ReviewSignoffSource
  const report = assessReviewSignoffs(source)
  console.log(`Court Week reviewed-source digest: ${report.contentDigest} (${report.revision})`)
  console.log(report.readyToPublish
    ? `Review signoffs complete: ${report.approvedRoles.join(', ')}`
    : `Review signoffs pending: ${report.pendingRoles.join(', ')}`)
  if (!report.exactSourceMatch) console.warn('Review signoffs target a different case revision or content digest; every role is pending.')
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath)
    mkdirSync(dirname(reportPath), { recursive: true })
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  }
  if (options.requireApproved) requirePublishableReview(report, options.expectedDigest, options.expectedRevision)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  reportCourtWeekReviewSignoffs({
    sourcePath: argument('--source'),
    reportPath: argument('--report'),
    expectedDigest: argument('--expected-digest'),
    expectedRevision: argument('--expected-revision'),
    requireApproved: process.argv.includes('--require-approved'),
  })
}
