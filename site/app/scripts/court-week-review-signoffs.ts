import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import { runtimeOpenCourtReturnCue, runtimeOutcomeAnalysisCue, type Agreement } from '../src/courtweek/engine/deliberation'
import type { CourtWeek } from '../src/courtweek/model/schema'
import { buildCourtWeekAudioJobs } from './court-week-audio-jobs'

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

export interface PinnedMediaCompatibility {
  schema: 'simjury.court-week-pinned-media-compatibility/v1'
  releaseTag: string
  releaseReviewDigest: string
  postMigrationReviewDigest: string
  mediaSourceDigest: string
  releaseSourceCommit: string
  metadataMigrationCommit: string
  basis: 'retired-duration-metadata-only'
}

export interface ReviewSignoffSource {
  schema: 'simjury.court-week-review-signoffs/v1'
  caseId: string
  revision: string
  contentDigest: string
  pinnedMedia?: PinnedMediaCompatibility
  signoffs: Array<{ role: ReviewRole; decision: ReviewDecision }>
}

export interface ReviewSignoffReport {
  schema: 'simjury.court-week-review-report/v1'
  caseId: string
  revision: string
  contentDigest: string
  mediaSourceDigest: string
  signoffRevision: string
  signoffDigest: string
  approvedRoles: ReviewRole[]
  pendingRoles: ReviewRole[]
  exactSourceMatch: boolean
  pinnedMediaCompatible: boolean
  pinnedMedia?: PinnedMediaCompatibility
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

function reviewedSceneAssets(directory: string, root = directory): Array<{ path: string; sha256: string }> {
  return readdirSync(directory, { withFileTypes: true })
    .sort(({ name: left }, { name: right }) => left.localeCompare(right))
    .flatMap((entry) => {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) return reviewedSceneAssets(absolute, root)
      if (!entry.isFile() || !/\.(?:avif|webp)$/i.test(entry.name)) return []
      return [{ path: relative(root, absolute).split('\\').join('/'), sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') }]
    })
}

const defaultSceneAssetRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../court-week-art', elevenMinutesCourtWeek.manifest.id, 'scenes')
let cachedDefaultSceneAssets: ReturnType<typeof reviewedSceneAssets> | undefined
const digestSceneAssets = (root: string) => resolve(root) === defaultSceneAssetRoot
  ? (cachedDefaultSceneAssets ??= reviewedSceneAssets(root)) : reviewedSceneAssets(root)

export function courtWeekReviewDigest(courtWeek: CourtWeek = elevenMinutesCourtWeek, sceneAssetRoot = defaultSceneAssetRoot): string {
  const exactReviewedSource = {
    revision: courtWeek.manifest.revision,
    contentAdvisory: courtWeek.manifest.contentAdvisory,
    trialRecord: courtWeek.trial,
    sessionPresentations: courtWeek.manifest.sessions,
    deliberationPack: courtWeek.deliberation,
    renderedSceneAssets: digestSceneAssets(sceneAssetRoot),
  }
  return `sha256:${createHash('sha256').update(canonicalJson(exactReviewedSource)).digest('hex')}`
}

const RETURN_VARIANTS: readonly (readonly [CourtWeek['deliberation']['outcomePaths'][number]['verdict'], Agreement])[] = [
  ['murder', 'unanimous'], ['murder', 'majority'],
  ['manslaughter', 'unanimous'], ['manslaughter', 'majority'],
  ['not-guilty', 'unanimous'], ['not-guilty', 'majority'],
  ['unable-to-agree', 'hung'],
]
const APPROVED_RELEASE_SOURCE_COMMIT = 'da395a60865af7b0a744145eddf3f0aff4a2f357'
const RETIRED_DURATION_MIGRATION_COMMIT = '3e2e8f9a5ad14fb5efc74e322893c4dd0cb80fa2'
const POST_MIGRATION_REVIEW_DIGEST = 'sha256:bd30414ae04005e61961c82b81a4918f9aa17cfc82b2bb8a0f348392aef886cc'

/** Exact static-media and runtime speech projection; excludes session/interaction UX metadata. */
export function courtWeekMediaSourceDigest(courtWeek: CourtWeek = elevenMinutesCourtWeek, sceneAssetRoot = defaultSceneAssetRoot): string {
  const jobs = buildCourtWeekAudioJobs(courtWeek).jobs.map(({ sessionId, sourceDigest }) => ({ sessionId, sourceDigest }))
  const cues = courtWeek.manifest.sessions.flatMap(({ scenes }) => scenes.flatMap(({ cues }) => cues))
  const returnCue = cues.find(({ id }) => id === 'sun-verdict-return')
  const analysisCue = cues.find(({ id }) => id === 'sun-analysis')
  if (!returnCue || !analysisCue) throw new Error('Court Week media source is missing a runtime outcome cue')
  const mediaSource = {
    caseId: courtWeek.manifest.id,
    revision: courtWeek.manifest.revision,
    releaseTag: courtWeek.manifest.releaseTag,
    cueProjection: courtWeek.manifest.sessions.map(({ id, day, scenes }) => ({
      id, day, scenes: scenes.map(({ id: sceneId, cues }) => ({ id: sceneId, cues })),
    })),
    prerecordedAudioJobs: jobs,
    runtimeSpeech: {
      returns: RETURN_VARIANTS.map(([verdict, agreement]) => ({
        verdict, agreement, cue: runtimeOpenCourtReturnCue(returnCue, verdict, agreement),
      })),
      sealedAnalysis: runtimeOutcomeAnalysisCue(analysisCue, courtWeek.deliberation, false),
      analyses: courtWeek.deliberation.outcomePaths.map(({ verdict }) => ({
        verdict, cue: runtimeOutcomeAnalysisCue(analysisCue, courtWeek.deliberation, true, verdict),
      })),
    },
    renderedSceneAssets: digestSceneAssets(sceneAssetRoot),
  }
  return `sha256:${createHash('sha256').update(canonicalJson(mediaSource)).digest('hex')}`
}

function validDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(value)
}

function assertPinnedMediaRecord(record: PinnedMediaCompatibility): void {
  if (record.schema !== 'simjury.court-week-pinned-media-compatibility/v1') throw new Error('Unsupported pinned media compatibility schema')
  if (!validDigest(record.releaseReviewDigest) || !validDigest(record.postMigrationReviewDigest) || !validDigest(record.mediaSourceDigest)) throw new Error('Pinned media compatibility requires SHA-256 digests')
  if (record.releaseSourceCommit !== APPROVED_RELEASE_SOURCE_COMMIT || record.metadataMigrationCommit !== RETIRED_DURATION_MIGRATION_COMMIT) {
    throw new Error('Pinned media compatibility requires the audited approval and migration commits')
  }
  if (record.basis !== 'retired-duration-metadata-only') throw new Error('Unsupported pinned media compatibility basis')
  if (record.postMigrationReviewDigest !== POST_MIGRATION_REVIEW_DIGEST) throw new Error('Pinned media compatibility requires the audited post-migration source')
}

export function assessReviewSignoffs(
  source: ReviewSignoffSource,
  courtWeek: CourtWeek = elevenMinutesCourtWeek,
  sceneAssetRoot = defaultSceneAssetRoot,
): ReviewSignoffReport {
  if (source.schema !== 'simjury.court-week-review-signoffs/v1') throw new Error('Unsupported Court Week review signoff schema')
  const roles = source.signoffs.map(({ role }) => role)
  const expectedRoles = new Set<string>(COURT_WEEK_REVIEW_ROLES)
  if (roles.length !== expectedRoles.size || new Set(roles).size !== roles.length || roles.some((role) => !expectedRoles.has(role))) {
    throw new Error('Court Week review signoffs must contain each required role exactly once')
  }
  if (source.signoffs.some(({ decision }) => decision !== 'pending' && decision !== 'approved')) {
    throw new Error('Court Week review decisions must be pending or approved')
  }

  const contentDigest = courtWeekReviewDigest(courtWeek, sceneAssetRoot)
  const mediaSourceDigest = courtWeekMediaSourceDigest(courtWeek, sceneAssetRoot)
  const revision = courtWeek.manifest.revision
  const sameCaseRevision = source.caseId === courtWeek.manifest.id && source.revision === revision
  const exactSourceMatch = sameCaseRevision
    && source.contentDigest === contentDigest
  const approvedRoles = exactSourceMatch
    ? source.signoffs.filter(({ decision }) => decision === 'approved').map(({ role }) => role)
    : []
  const pendingRoles = COURT_WEEK_REVIEW_ROLES.filter((role) => !approvedRoles.includes(role))
  if (source.pinnedMedia) assertPinnedMediaRecord(source.pinnedMedia)
  const pinnedMediaCompatible = exactSourceMatch
    && source.pinnedMedia?.postMigrationReviewDigest === contentDigest
    && source.pinnedMedia.mediaSourceDigest === mediaSourceDigest
  return {
    schema: 'simjury.court-week-review-report/v1',
    caseId: courtWeek.manifest.id,
    revision,
    contentDigest,
    mediaSourceDigest,
    signoffRevision: source.revision,
    signoffDigest: source.contentDigest,
    approvedRoles,
    pendingRoles,
    exactSourceMatch,
    pinnedMediaCompatible,
    pinnedMedia: source.pinnedMedia,
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

export function requirePinnedMediaCompatibility(
  report: ReviewSignoffReport,
  expectedReleaseDigest: string,
  expectedRevision: string,
  expectedReleaseTag: string,
): void {
  const pinned = report.pinnedMedia
  if (!report.pinnedMediaCompatible || !pinned) throw new Error('Pinned media blocked: current reviewed source or media projection differs from the audited compatibility record')
  if (report.revision !== expectedRevision || pinned.releaseReviewDigest !== expectedReleaseDigest || pinned.releaseTag !== expectedReleaseTag) {
    throw new Error('Pinned media blocked: immutable Release identity differs from the compatibility record')
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
  requirePinnedMedia?: boolean
  expectedDigest?: string
  expectedRevision?: string
  expectedReleaseTag?: string
} = {}): ReviewSignoffReport {
  const sourcePath = resolve(options.sourcePath ?? 'content-reviews/cw-0001.review-signoffs.json')
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as ReviewSignoffSource
  const report = assessReviewSignoffs(source)
  console.log(`Court Week reviewed-source digest: ${report.contentDigest} (${report.revision})`)
  console.log(`Court Week media-source digest: ${report.mediaSourceDigest}`)
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
  if (options.requirePinnedMedia) {
    if (!options.expectedDigest || !options.expectedRevision || !options.expectedReleaseTag) throw new Error('Pinned media verification requires expected digest, revision and Release tag')
    requirePinnedMediaCompatibility(report, options.expectedDigest, options.expectedRevision, options.expectedReleaseTag)
    console.log(`Pinned media compatibility verified for ${options.expectedReleaseTag}.`)
  }
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  reportCourtWeekReviewSignoffs({
    sourcePath: argument('--source'),
    reportPath: argument('--report'),
    expectedDigest: argument('--expected-digest'),
    expectedRevision: argument('--expected-revision'),
    expectedReleaseTag: argument('--expected-release-tag'),
    requireApproved: process.argv.includes('--require-approved'),
    requirePinnedMedia: process.argv.includes('--require-pinned-media'),
  })
}
