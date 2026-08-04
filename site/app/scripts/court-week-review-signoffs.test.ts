import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../src/courtweek/content/elevenMinutes'
import {
  assessReviewSignoffs,
  COURT_WEEK_REVIEW_ROLES,
  courtWeekReviewDigest,
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
  it('computes one deterministic SHA-256 digest over the exact legal content', () => {
    expect(courtWeekReviewDigest()).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(courtWeekReviewDigest()).toBe(courtWeekReviewDigest())
  })

  it('reports pending roles without treating them as approvals', () => {
    const report = assessReviewSignoffs(source())
    expect(report.exactSourceMatch).toBe(true)
    expect(report.readyToPublish).toBe(false)
    expect(report.approvedRoles).toEqual([])
    expect(report.pendingRoles).toEqual(COURT_WEEK_REVIEW_ROLES)
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

  it('rejects duplicate, missing or unknown role records', () => {
    const duplicate = source()
    duplicate.signoffs[1] = duplicate.signoffs[0]
    expect(() => assessReviewSignoffs(duplicate)).toThrow('each required role exactly once')

    const missing = source()
    missing.signoffs.pop()
    expect(() => assessReviewSignoffs(missing)).toThrow('each required role exactly once')
  })
})
