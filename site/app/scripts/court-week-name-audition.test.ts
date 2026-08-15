import { describe, expect, it } from 'vitest'
import {
  COURT_WEEK_NAME_CLEARANCE_SCHEMA,
  COURT_WEEK_NAME_PROPOSALS,
} from '../src/courtweek/content/nameClearance'
import { MONDAY_SPEECH_CANDIDATE } from '../src/courtweek/content/mondaySpeechCandidate'
import { buildChirpAuditionPlan, CHIRP_AUDITION_TEXT } from './court-week-chirp-audition'
import {
  buildCourtWeekNameAudition,
  COURT_WEEK_NAME_AUDITION_SCHEMA,
  COURT_WEEK_JURISDICTION_AUDITION_TERM,
  COURT_WEEK_JURISDICTION_AUDITION_TEXT,
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
    expect(audition.nonPersonalProperNames).toEqual([COURT_WEEK_JURISDICTION_AUDITION_TERM])
    expect(audition.plan.jobs).toHaveLength(30)
    expect(audition.plan.audition.text).not.toBe(CHIRP_AUDITION_TEXT)
    expect(audition.plan.binding).toEqual({
      schema: COURT_WEEK_NAME_CLEARANCE_SCHEMA,
      digest: audition.proposalDigest,
    })
    expect(audition.candidateDigest).toBe('sha256:75d956ea844276ad38125a9196667d5763d87f6b350ceb53825825be8dc9aa75')
    expect(audition.proposalDigest).toBe('sha256:1235db79e7b8ab4e830df629b7b122743c80a260cdafa8c6ac49d2be4332282c')
    expect(audition.plan.planDigest).toBe('sha256:51733fb44c6b8425da96e844e243a8bbcbd2ca77c11f14b93a940be78382aa4d')
    for (const proposal of COURT_WEEK_NAME_PROPOSALS.filter(({ proposedPersonalName }) => proposedPersonalName)) {
      expect(audition.plan.audition.text.split(proposal.proposedPersonalName!).length).toBe(2)
    }
    expect(audition.plan.audition.characterCount).toBe(643)
    expect(audition.plan.characterTotals).toEqual({ jobCount: 30, providerCharacters: 19_290 })
    expect(audition.plan.audition.text.split(COURT_WEEK_JURISDICTION_AUDITION_TERM)).toHaveLength(2)
    expect(MONDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ text }) => text))
      .filter((text) => text.includes(COURT_WEEK_JURISDICTION_AUDITION_TEXT))).toHaveLength(1)
    expect(audition.plan.conservativeGrossCost).toMatchObject({
      grossAudMicros: 818_761, exactAudAcknowledgement: '0.818761',
    })
    expect(audition.plan.conservativeGrossCost.grossAudMicros).toBeLessThan(1_000_000)
  })

  it('changes all job identities when the audition text changes', () => {
    const baseline = buildChirpAuditionPlan()
    const names = buildCourtWeekNameAudition().plan
    expect(names.planDigest).not.toBe(baseline.planDigest)
    expect(names.jobs.map(({ jobId }) => jobId)).not.toEqual(baseline.jobs.map(({ jobId }) => jobId))
  })

  it('binds proposal governance into the plan without changing audio request identity', () => {
    const audition = buildCourtWeekNameAudition()
    const changedBinding = buildChirpAuditionPlan(audition.plan.audition.text, {
      schema: COURT_WEEK_NAME_CLEARANCE_SCHEMA,
      digest: `sha256:${'0'.repeat(64)}`,
    })
    expect(changedBinding.planDigest).not.toBe(audition.plan.planDigest)
    expect(changedBinding.jobs).toEqual(audition.plan.jobs)
    expect(() => buildChirpAuditionPlan(audition.plan.audition.text, {
      schema: COURT_WEEK_NAME_CLEARANCE_SCHEMA,
      digest: 'sha256:invalid',
    })).toThrow(/binding requires/i)
  })

  it('is plan-only without an explicit cost-acknowledged execution request', async () => {
    let calls = 0
    const forbiddenFetch: typeof fetch = async () => {
      calls += 1
      throw new Error('network must remain idle')
    }
    const result = await runCourtWeekNameAuditionCli([], {}, forbiddenFetch)
    expect(result).toMatchObject({
      schema: COURT_WEEK_NAME_AUDITION_SCHEMA,
      candidateDigest: buildCourtWeekNameAudition().candidateDigest,
      proposalDigest: buildCourtWeekNameAudition().proposalDigest,
      actorIds: buildCourtWeekNameAudition().actorIds,
      names: buildCourtWeekNameAudition().names,
      nonPersonalProperNames: [COURT_WEEK_JURISDICTION_AUDITION_TERM],
      mode: 'plan',
    })
    expect(calls).toBe(0)
  })
})
