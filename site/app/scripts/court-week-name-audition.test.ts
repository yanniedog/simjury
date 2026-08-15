import { describe, expect, it } from 'vitest'
import { COURT_WEEK_NAME_PROPOSALS } from '../src/courtweek/content/nameClearance'
import { buildChirpAuditionPlan, CHIRP_AUDITION_TEXT } from './court-week-chirp-audition'
import {
  buildCourtWeekNameAudition,
  COURT_WEEK_NAME_AUDITION_SCHEMA,
  runCourtWeekNameAuditionCli,
} from './court-week-name-audition'

describe('pending Australian courtroom name audition', () => {
  it('plans every proposed personal name once across all 30 Australian voices', () => {
    const audition = buildCourtWeekNameAudition()
    expect(buildCourtWeekNameAudition()).toEqual(audition)
    expect(audition.schema).toBe(COURT_WEEK_NAME_AUDITION_SCHEMA)
    expect(audition.actorIds).toHaveLength(24)
    expect(new Set(audition.actorIds).size).toBe(24)
    expect(audition.names).toHaveLength(24)
    expect(audition.plan.jobs).toHaveLength(30)
    expect(audition.plan.audition.text).not.toBe(CHIRP_AUDITION_TEXT)
    for (const proposal of COURT_WEEK_NAME_PROPOSALS.filter(({ proposedPersonalName }) => proposedPersonalName)) {
      expect(audition.plan.audition.text.split(proposal.proposedPersonalName!).length).toBe(2)
    }
    expect(audition.plan.characterTotals.providerCharacters)
      .toBe(audition.plan.audition.characterCount * 30)
    expect(audition.plan.conservativeGrossCost.grossAudMicros).toBeLessThan(1_000_000)
  })

  it('changes all job identities when the audition text changes', () => {
    const baseline = buildChirpAuditionPlan()
    const names = buildCourtWeekNameAudition().plan
    expect(names.planDigest).not.toBe(baseline.planDigest)
    expect(names.jobs.map(({ jobId }) => jobId)).not.toEqual(baseline.jobs.map(({ jobId }) => jobId))
  })

  it('is plan-only without an explicit cost-acknowledged execution request', async () => {
    let calls = 0
    const forbiddenFetch: typeof fetch = async () => {
      calls += 1
      throw new Error('network must remain idle')
    }
    const result = await runCourtWeekNameAuditionCli([], {}, forbiddenFetch)
    expect(result).toMatchObject({ schema: COURT_WEEK_NAME_AUDITION_SCHEMA, mode: 'plan' })
    expect(calls).toBe(0)
  })
})
