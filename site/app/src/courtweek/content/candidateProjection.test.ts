import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import {
  buildCourtWeekCandidateProjection,
  courtWeekCandidateProjectionDigest,
  COURT_WEEK_CANDIDATE_PROJECTION_SCHEMA,
} from './candidateProjection'
import { COURT_WEEK_SPEECH_CANDIDATES } from './speechReviewLedger'

describe('inactive next-revision candidate projection', () => {
  it('maps every reviewed day, source, turn and runtime branch without active audio', () => {
    const projection = buildCourtWeekCandidateProjection()
    expect(projection.schema).toBe(COURT_WEEK_CANDIDATE_PROJECTION_SCHEMA)
    expect(projection.currentRevision).toBe(elevenMinutesCourtWeek.manifest.revision)
    expect(projection.candidateDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(projection.impact).toMatchObject({
      days: 7, activeSourceCueIds: 127, candidateCues: 136, turns: 351,
      captionCueIds: 303, syntheticCueIds: ['sun-fresh-unanimity-ballot'],
    })
    expect(projection.impact.runtimeVariants).toEqual([
      'murder:unanimous', 'murder:majority', 'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority', 'unable-to-agree:hung',
      'analysis:murder', 'analysis:manslaughter', 'analysis:not-guilty', 'analysis:unable-to-agree',
    ])
    const payload = {
      schema: projection.schema, caseId: projection.caseId,
      currentRevision: projection.currentRevision, days: projection.days,
    }
    expect(projection.candidateDigest).toBe(courtWeekCandidateProjectionDigest(JSON.parse(JSON.stringify(payload))))
    expect(projection.days.flatMap(({ primary, variants }) => [...primary, ...variants])
      .flatMap(({ turns }) => turns).some((turn) => 'quotedSpans' in turn && turn.quotedSpans === undefined)).toBe(false)
    expect(JSON.stringify(projection)).not.toContain('audio')
  })

  it('locks Day 1 legal order and the fresh-ballot insertion boundary', () => {
    const projection = buildCourtWeekCandidateProjection()
    const monday = projection.days[0]!
    expect(monday.primary.map(({ sourceMetadata }) => sourceMetadata[0]?.event).slice(1, 6)).toEqual([
      'empanelment', 'oath', 'plea', 'preliminary-direction', 'preliminary-direction',
    ])
    const plea = monday.primary.find(({ id }) => id === 'mon-plea')!
    expect(plea.turns.map(({ actorId, legalAction, text }) => ({ actorId, legalAction, text }))).toEqual([
      { actorId: 'clerk', legalAction: 'charge-read', text: expect.any(String) },
      { actorId: 'clerk', legalAction: 'plea-question', text: 'How do you plead?' },
      { actorId: 'accused', legalAction: 'plea-answer', text: 'Not guilty.' },
      { actorId: 'judge', legalAction: 'direction', text: expect.any(String) },
    ])
    const fresh = projection.days[6]!.primary.find(({ id }) => id === 'sun-fresh-unanimity-ballot')!
    expect(fresh.syntheticPlacement).toEqual({
      afterSourceCueId: 'sun-further-discussion', beforeSourceCueId: 'sun-majority-direction',
    })
    expect(fresh.event).toBe('second-ballot')
    expect(fresh.turns[0]).toMatchObject({ actorId: 'edda-rook', legalAction: 'ballot-administration' })
    const murderAnalysis = projection.days[6]!.variants.find(({ variant }) => variant === 'analysis:murder')!
    expect(murderAnalysis).toMatchObject({
      verdict: 'murder', agreement: null,
      threshold: expect.stringContaining('beyond reasonable doubt'),
      lawfulRationale: expect.stringContaining('Recognition of AR-71'),
      counterAnalysis: expect.stringContaining('genuine warning'),
    })
    const changed = structuredClone(COURT_WEEK_SPEECH_CANDIDATES)
    const changedMurder = changed[6]!.variants.find(({ verdict, threshold }) => verdict === 'murder' && threshold)!
    changedMurder.threshold += ' Reviewed threshold change.'
    expect(buildCourtWeekCandidateProjection(changed).candidateDigest).not.toBe(projection.candidateDigest)
  })

  it('keeps ActorIds stable when display labels evolve', () => {
    const projection = buildCourtWeekCandidateProjection()
    const judge = projection.days.flatMap(({ primary, variants }) => [...primary, ...variants])
      .flatMap(({ turns }) => turns).filter(({ actorId }) => actorId === 'judge')
    expect(judge.length).toBeGreaterThan(0)
    expect(new Set(judge.map(({ actorId }) => actorId))).toEqual(new Set(['judge']))
    expect(new Set(judge.map(({ displayLabel }) => displayLabel))).toEqual(new Set(['Judge Sel Aven']))
  })

  it('fails closed on missing source coverage and stale synthetic placement anchors', () => {
    const missing = COURT_WEEK_SPEECH_CANDIDATES.map((day) => day.day === 'monday'
      ? { ...day, sourceCueIds: day.sourceCueIds.slice(1) } : day)
    expect(() => buildCourtWeekCandidateProjection(missing)).toThrow(/source coverage/i)

    const sessions = structuredClone(elevenMinutesCourtWeek.manifest.sessions)
    const sunday = sessions.find(({ day }) => day === 'Sunday')!
    for (const scene of sunday.scenes) scene.cues = scene.cues.filter(({ id, sourceCueId }) =>
      (sourceCueId ?? id) !== 'sun-further-discussion')
    expect(() => buildCourtWeekCandidateProjection(undefined, sessions)).toThrow(/source coverage|placement anchors/i)

    const reordered = structuredClone(elevenMinutesCourtWeek.manifest.sessions)
    const reorderedSunday = reordered.find(({ day }) => day === 'Sunday')!
    const after = reorderedSunday.scenes.findIndex(({ id }) => id === 'sun-persevere')
    const before = reorderedSunday.scenes.findIndex(({ id }) => id === 'sun-majority')
    ;[reorderedSunday.scenes[after], reorderedSunday.scenes[before]] = [
      reorderedSunday.scenes[before]!, reorderedSunday.scenes[after]!,
    ]
    expect(() => buildCourtWeekCandidateProjection(undefined, reordered)).toThrow(/placement anchors are out of order/i)
  })
})
