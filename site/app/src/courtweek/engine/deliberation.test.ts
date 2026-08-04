import { describe, expect, it } from 'vitest'
import { elevenMinutesDeliberation } from '../content/deliberation'
import type { ReasoningContribution, ReasoningMove, Verdict } from '../model/schema'
import {
  aggregateFirstBallot,
  assessReasoningContribution,
  calculateFinalBallot,
  calculateSecondBallot,
  analysisForReturnedVerdict,
  evolveAuthoredBallot,
  firstBallotForScene,
  openCourtReturn,
  outcomeAnalysis,
  nextSundaySceneId,
  unanimousVerdict,
} from './deliberation'

function contributions(count: number, sceneId = 'sat-causation'): ReasoningContribution[] {
  const moves: ReasoningMove[] = ['connect', 'distinguish', 'test-source', 'challenge-inference', 'raise-alternative', 'apply-burden']
  return Array.from({ length: count }, (_, index) => ({
    sceneId,
    legalQuestion: `Question ${index + 1}`,
    evidenceId: `exhibit-${index + 1}`,
    move: moves[index % moves.length],
    recordedAt: new Date(index * 1000).toISOString(),
    influencePenalty: 0,
  }))
}

function finalResult(verdict: Verdict, before: number, after: number, direction = true) {
  return calculateFinalBallot({
    pack: elevenMinutesDeliberation,
    secondVote: verdict,
    finalVote: verdict,
    contributions: [...contributions(before), ...contributions(after, 'sun-persevere')],
    secondBallotWasUnanimous: false,
    majorityDirectionReceived: direction,
    elapsedCourtHours: 8.5,
  })
}

describe('Court Week deliberation engine', () => {
  it('hides the authored count until the player is added and always totals twelve', () => {
    expect(Object.values(elevenMinutesDeliberation.firstBallot).reduce((a, b) => a + b, 0)).toBe(11)
    expect(aggregateFirstBallot(elevenMinutesDeliberation, 'murder')).toEqual({
      murder: 4, manslaughter: 3, 'not-guilty': 4, 'unable-to-agree': 1,
    })
  })

  it('reveals the first aggregate in its scene from the persisted sealed vote', () => {
    expect(firstBallotForScene(elevenMinutesDeliberation, 'sat-provisional', 'murder')).toBeNull()
    expect(firstBallotForScene(elevenMinutesDeliberation, 'sat-first-ballot')).toBeNull()
    const aggregate = firstBallotForScene(elevenMinutesDeliberation, 'sat-first-ballot', 'murder')
    expect(aggregate).toEqual({ murder: 4, manslaughter: 3, 'not-guilty': 4, 'unable-to-agree': 1 })
    expect(Object.values(aggregate ?? {}).reduce((sum, count) => sum + count, 0)).toBe(12)
  })

  it('moves no more than one anonymous authored vote per lawful contribution', () => {
    const afterOne = evolveAuthoredBallot(elevenMinutesDeliberation.firstBallot, 'murder', 1)
    const afterTwo = evolveAuthoredBallot(elevenMinutesDeliberation.firstBallot, 'murder', 2)
    expect(afterOne.murder).toBe(4)
    expect(afterTwo.murder).toBe(5)
    expect(Object.values(afterTwo).reduce((a, b) => a + b, 0)).toBe(11)
  })

  it.each(elevenMinutesDeliberation.improperArguments)(
    'corrects and removes influence from the authored improper claim "$claim"',
    (improper) => {
      const assessment = assessReasoningContribution(elevenMinutesDeliberation, {
        sceneId: 'sat-improper',
        legalQuestion: elevenMinutesDeliberation.legalQuestions[0],
        evidenceId: 'ex-downgrade-log',
        move: 'apply-burden',
        recordedAt: '2026-08-15T09:00:00+10:00',
        improperClaim: improper.claim,
      })

      expect(assessment.correction).toBe(improper.correction)
      expect(assessment.contribution.influencePenalty).toBe(improper.influencePenalty)
      expect(assessment.contribution).not.toHaveProperty('improperClaim')
      expect(calculateSecondBallot(
        elevenMinutesDeliberation,
        'murder',
        [assessment.contribution],
      )).toEqual(aggregateFirstBallot(elevenMinutesDeliberation, 'murder'))
    },
  )

  it.each(elevenMinutesDeliberation.reasoningMoves)(
    'leaves the lawful %s reasoning move unchanged when no prohibited basis is proposed',
    (move) => {
      const assessment = assessReasoningContribution(elevenMinutesDeliberation, {
        sceneId: 'sat-improper',
        legalQuestion: elevenMinutesDeliberation.legalQuestions[0],
        evidenceId: 'ex-downgrade-log',
        move,
        recordedAt: '2026-08-15T09:00:00+10:00',
      })

      expect(assessment).toMatchObject({ correction: null, contribution: { move, influencePenalty: 0 } })
      expect(calculateSecondBallot(
        elevenMinutesDeliberation,
        'murder',
        [assessment.contribution],
      ).murder).toBe(5)
    },
  )

  it.each([
    ['murder', 8],
    ['manslaughter', 8],
    ['not-guilty', 7],
  ] as const)('can reach a unanimous %s second ballot deterministically', (verdict, steps) => {
    const ballot = calculateSecondBallot(elevenMinutesDeliberation, verdict, contributions(steps))
    expect(unanimousVerdict(ballot)).toBe(verdict)
    expect(ballot[verdict]).toBe(12)
  })

  it.each([
    ['murder', 6],
    ['manslaughter', 6],
    ['not-guilty', 5],
  ] as const)('returns an authorised eleven-to-one %s verdict only after further discussion', (verdict, before) => {
    const result = finalResult(verdict, before, 1)
    expect(result.verdict).toBe(verdict)
    expect(result.agreement).toBe('majority')
    expect(result.aggregate[verdict]).toBe(11)
  })

  it('returns a hung jury without a direction or further discussion', () => {
    expect(finalResult('murder', 6, 1, false).agreement).toBe('hung')
    expect(finalResult('murder', 6, 0).agreement).toBe('hung')
    expect(finalResult('unable-to-agree', 8, 2).verdict).toBe('unable-to-agree')
  })

  it('branches around coercive majority scenes after a unanimous second ballot', () => {
    expect(nextSundaySceneId('sun-second-ballot', true)).toBe('sun-verdict')
    expect(nextSundaySceneId('sun-second-ballot', false)).toBe('sun-persevere')
    expect(nextSundaySceneId('sun-persevere', false)).toBe('sun-majority')
    expect(nextSundaySceneId('sun-majority', false)).toBe('sun-final-ballot')
  })

  it('keeps analysis matched to the returned verdict and neutral about correctness', () => {
    expect(analysisForReturnedVerdict(elevenMinutesDeliberation)).toBeNull()
    for (const verdict of ['murder', 'manslaughter', 'not-guilty', 'unable-to-agree'] as Verdict[]) {
      const analysis = outcomeAnalysis(elevenMinutesDeliberation, verdict)
      expect(analysis.verdict).toBe(verdict)
      expect(analysis.lawfulRationale.length).toBeGreaterThan(80)
      expect(analysis.counterAnalysis.length).toBeGreaterThan(80)
      expect(`${analysis.lawfulRationale} ${analysis.counterAnalysis}`).not.toMatch(/correct answer/i)
    }
  })

  it('speaks the computed result only as an open-court return', () => {
    expect(openCourtReturn('murder', 'majority')).toContain('accused stands')
    expect(openCourtReturn('murder', 'majority')).toContain('eleven-to-one')
    expect(openCourtReturn('not-guilty', 'unanimous')).toContain('Not Guilty')
    expect(openCourtReturn('unable-to-agree', 'hung')).toContain('unable to agree')
  })
})
