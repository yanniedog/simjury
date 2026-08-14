import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import {
  assessReviewSignoffs,
  COURT_WEEK_REVIEW_ROLES,
  courtWeekMediaSourceDigest,
  courtWeekReviewDigest,
  requirePinnedMediaCompatibility,
  requirePublishableReview,
  type ReviewSignoffSource,
} from './court-week-review-signoffs'

function source(decision: 'pending' | 'approved' = 'pending'): ReviewSignoffSource {
  return {
    schema: 'simjury.court-week-review-signoffs/v1',
    caseId: elevenMinutesCourtWeek.manifest.id,
    revision: elevenMinutesCourtWeek.manifest.revision,
    contentDigest: courtWeekReviewDigest(),
    signoffs: COURT_WEEK_REVIEW_ROLES.map((role) => ({ role, decision })),
  }
}

describe('Court Week reviewed-source signoffs', () => {
  it('computes one deterministic SHA-256 digest over the exact reviewed content and rendered art', () => {
    expect(courtWeekReviewDigest()).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(courtWeekReviewDigest()).toBe(courtWeekReviewDigest())
    expect(courtWeekMediaSourceDigest()).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(courtWeekMediaSourceDigest()).toBe(courtWeekMediaSourceDigest())
  })

  it('separates retired duration metadata from exact media source', () => {
    const changed = structuredClone(elevenMinutesCourtWeek)
    const session = changed.manifest.sessions[0]
    const scene = session.scenes.find(({ interaction }) => interaction)!
    const interaction = scene.interaction!
    ;(session as unknown as Record<string, unknown>)[['target', 'Minutes'].join('')] = 20
    ;(scene as unknown as Record<string, unknown>)[['transition', 'Seconds'].join('')] = 8
    ;(interaction as unknown as Record<string, unknown>)[['minimum', 'Seconds'].join('')] = 45

    expect(courtWeekReviewDigest(changed)).not.toBe(courtWeekReviewDigest())
    expect(courtWeekMediaSourceDigest(changed)).toBe(courtWeekMediaSourceDigest())
    const ledger = JSON.parse(readFileSync(
      join(process.cwd(), 'content-reviews/cw-0001.review-signoffs.json'), 'utf8',
    )) as ReviewSignoffSource
    const report = assessReviewSignoffs(ledger, changed)
    expect(report.exactSourceMatch).toBe(false)
    expect(report.pinnedMediaCompatible).toBe(true)
    expect(() => requirePinnedMediaCompatibility(
      report, ledger.pinnedMedia!.releaseReviewDigest, report.revision, ledger.pinnedMedia!.releaseTag,
    )).not.toThrow()
  })

  it('invalidates media compatibility for prerecorded captions or dynamic analysis drift', () => {
    const cueDrift = structuredClone(elevenMinutesCourtWeek)
    cueDrift.manifest.sessions[0].scenes[0].cues[0].text += ' Drift.'
    expect(courtWeekMediaSourceDigest(cueDrift)).not.toBe(courtWeekMediaSourceDigest())

    const dynamicDrift = structuredClone(elevenMinutesCourtWeek)
    dynamicDrift.deliberation.outcomePaths[0].lawfulRationale += ' Drift.'
    expect(courtWeekMediaSourceDigest(dynamicDrift)).not.toBe(courtWeekMediaSourceDigest())
  })

  it('invalidates the review digest when the pre-entry content advisory changes', () => {
    const changed = structuredClone(elevenMinutesCourtWeek)
    changed.manifest.contentAdvisory += ' Changed after review.'

    expect(courtWeekReviewDigest(changed)).not.toBe(courtWeekReviewDigest())
  })

  it('invalidates the review digest when a rendered scene asset changes', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'simjury-reviewed-art-'))
    try {
      const scene = join(temporary, 'mon-arrival')
      mkdirSync(scene)
      const rendition = join(scene, 'portrait.webp')
      writeFileSync(rendition, 'first reviewed raster')
      const reviewed = courtWeekReviewDigest(elevenMinutesCourtWeek, temporary)
      const reviewedMedia = courtWeekMediaSourceDigest(elevenMinutesCourtWeek, temporary)
      writeFileSync(rendition, 'replacement raster')
      expect(courtWeekReviewDigest(elevenMinutesCourtWeek, temporary)).not.toBe(reviewed)
      expect(courtWeekMediaSourceDigest(elevenMinutesCourtWeek, temporary)).not.toBe(reviewedMedia)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  })

  it('reports pending roles without treating them as approvals', () => {
    const report = assessReviewSignoffs(source())
    expect(report.exactSourceMatch).toBe(true)
    expect(report.readyToPublish).toBe(false)
    expect(report.approvedRoles).toEqual([])
    expect(report.pendingRoles).toEqual(COURT_WEEK_REVIEW_ROLES)
    expect(report.pinnedMediaCompatible).toBe(false)
  })

  it('pins the checked-in pending ledger to the exact reviewed source', () => {
    const checkedIn = JSON.parse(readFileSync(
      join(process.cwd(), 'content-reviews/cw-0001.review-signoffs.json'),
      'utf8',
    )) as ReviewSignoffSource
    const report = assessReviewSignoffs(checkedIn)

    expect(report.exactSourceMatch).toBe(true)
    expect(report.readyToPublish).toBe(false)
    expect(report.approvedRoles).toEqual([])
    expect(report.pendingRoles).toEqual(COURT_WEEK_REVIEW_ROLES)
    expect(report.pinnedMediaCompatible).toBe(true)
    expect(() => requirePinnedMediaCompatibility(
      report,
      `sha256:acf35d82827884b22c8a7edbc7097b315155991c76fdf9d6cbf7b8181999b3af`,
      '2026.08.03-r2',
      'court-week-cw-0001-2026.08.03-r3',
    )).not.toThrow()
  })

  it('accepts all required roles only when they approve the exact source', () => {
    const approved = assessReviewSignoffs(source('approved'))
    expect(approved.readyToPublish).toBe(true)
    expect(() => requirePublishableReview(approved, approved.contentDigest, approved.revision)).not.toThrow()
    const stale = source('approved')
    stale.contentDigest = `sha256:${'f'.repeat(64)}`
    const report = assessReviewSignoffs(stale)
    expect(report.readyToPublish).toBe(false)
    expect(report.approvedRoles).toEqual([])
    expect(report.pendingRoles).toEqual(COURT_WEEK_REVIEW_ROLES)
  })

  it('fails publication closed for pending roles or a different artifact digest', () => {
    const pending = assessReviewSignoffs(source())
    expect(() => requirePublishableReview(pending)).toThrow('publication blocked')
    const approved = assessReviewSignoffs(source('approved'))
    expect(() => requirePublishableReview(approved, `sha256:${'0'.repeat(64)}`)).toThrow('does not match')
  })

  it('fails pinned media closed for source drift or another immutable Release', () => {
    const checkedIn = JSON.parse(readFileSync(
      join(process.cwd(), 'content-reviews/cw-0001.review-signoffs.json'),
      'utf8',
    )) as ReviewSignoffSource
    checkedIn.pinnedMedia!.mediaSourceDigest = `sha256:${'0'.repeat(64)}`
    const stale = assessReviewSignoffs(checkedIn)
    expect(stale.pinnedMediaCompatible).toBe(false)
    expect(() => requirePinnedMediaCompatibility(stale, checkedIn.pinnedMedia!.releaseReviewDigest, stale.revision, checkedIn.pinnedMedia!.releaseTag))
      .toThrow('current dialogue, captions, audio or art differ')

    const current = assessReviewSignoffs(JSON.parse(readFileSync(
      join(process.cwd(), 'content-reviews/cw-0001.review-signoffs.json'),
      'utf8',
    )) as ReviewSignoffSource)
    expect(() => requirePinnedMediaCompatibility(current, `sha256:${'f'.repeat(64)}`, current.revision, current.pinnedMedia!.releaseTag))
      .toThrow('Release identity differs')
  })

  it('rejects duplicate, missing or unknown role records', () => {
    const duplicate = source()
    duplicate.signoffs[1] = duplicate.signoffs[0]
    expect(() => assessReviewSignoffs(duplicate)).toThrow('each required role exactly once')

    const missing = source()
    missing.signoffs.pop()
    expect(() => assessReviewSignoffs(missing)).toThrow('each required role exactly once')
  })
})
