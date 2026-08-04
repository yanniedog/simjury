import { describe, expect, it } from 'vitest'
import { elevenMinutesDeliberation } from '../content/deliberation'
import { elevenMinutesSessions } from '../content/sessions'
import {
  furtherDiscussionContributionSceneIds,
  preSecondBallotContributionSceneIds,
} from '../model/deliberationContract'
import type { ReasoningContribution, Verdict } from '../model/schema'
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
} from './deliberation'

const orderedScenes = elevenMinutesSessions.flatMap((session) => session.scenes)
const retirementIndex = orderedScenes.findIndex((scene) => scene.id === 'fri-retire')
const secondBallotIndex = orderedScenes.findIndex((scene) => scene.id === 'sun-second-ballot')
const majorityIndex = orderedScenes.findIndex((scene) => scene.id === 'sun-majority')
const journeyReasoningSceneIds = (start: number, end: number) => orderedScenes
  .slice(start, end)
  .filter((scene) => scene.interaction?.kind === 'reasoning')
  .map((scene) => scene.id)
const preSecondJourney = journeyReasoningSceneIds(retirementIndex + 1, secondBallotIndex)
const furtherDiscussionJourney = journeyReasoningSceneIds(secondBallotIndex + 1, majorityIndex)

const propositionForVerdict: Record<Exclude<Verdict, 'unable-to-agree'>, string> = {
  murder: 'prop-intent-sequence-support',
  manslaughter: 'prop-negligence-delay-support',
  'not-guilty': 'prop-causation-window-doubt',
}

function contributions(
  sceneIds: readonly string[],
  propositionId = 'prop-intent-sequence-support',
): ReasoningContribution[] {
  const proposition = elevenMinutesDeliberation.propositions.find(({ id }) => id === propositionId)!
  if (!sceneIds.every((sceneId) => proposition.sceneIds.includes(sceneId))) {
    throw new Error(`${propositionId} is not reviewed for every requested scene`)
  }
  return sceneIds.map((sceneId, index) => ({
    propositionId,
    sceneId,
    legalQuestion: proposition.legalQuestion,
    evidenceId: proposition.evidenceIds[0],
    move: proposition.moves[0],
    recordedAt: new Date(index * 1000).toISOString(),
    influencePenalty: 0,
  }))
}

function outcomeContributions(verdict: Verdict): ReasoningContribution[] {
  if (verdict === 'murder') return contributions(
    ['sat-room', 'sat-concerns', 'sat-first-ballot', 'sat-separate', 'sun-persevere'],
    propositionForVerdict.murder,
  ).concat(contributions(['sat-causation'], 'prop-causation-route-support'))
  if (verdict === 'manslaughter') return [
    ...contributions(['sat-room', 'sat-concerns', 'sat-first-ballot', 'sat-separate', 'sun-negligence'], propositionForVerdict.manslaughter),
    ...contributions(['sat-causation'], 'prop-causation-window-support'),
    ...contributions(['sun-resume'], 'prop-resume-negligence-support'),
    ...contributions(['sun-persevere'], propositionForVerdict.manslaughter),
  ]
  if (verdict === 'not-guilty') return [
    ...contributions(['sat-room', 'sat-concerns', 'sat-first-ballot', 'sat-separate', 'sun-persevere'], 'prop-intent-error-alternative'),
    ...contributions(['sat-causation', 'sun-negligence'], propositionForVerdict['not-guilty']),
    ...contributions(['sun-resume'], 'prop-resume-intent-alternative'),
  ]
  return [
    ...contributions(['sat-concerns', 'sun-resume'], 'prop-intent-source-limit'),
    ...contributions(['sat-improper'], 'prop-improper-boundary'),
    ...contributions(['sat-causation'], 'prop-causation-window-doubt'),
    ...contributions(['sun-persevere'], 'prop-duty-source-limit'),
  ]
}

function finalResult(verdict: Verdict, direction = true) {
  return calculateFinalBallot({
    pack: elevenMinutesDeliberation,
    secondVote: verdict,
    finalVote: verdict,
    contributions: outcomeContributions(verdict),
    secondBallotWasUnanimous: false,
    majorityDirectionReceived: direction,
    elapsedCourtHours: 8.5,
  })
}

describe('Court Week deliberation engine', () => {
  it('binds ballot influence to the authored post-retirement journey', () => {
    expect(preSecondJourney).toEqual(preSecondBallotContributionSceneIds)
    expect(furtherDiscussionJourney).toEqual(furtherDiscussionContributionSceneIds)
    expect(preSecondJourney).toHaveLength(8)
    expect(orderedScenes.filter((scene) => (
      preSecondJourney.includes(scene.id) && scene.interaction?.optional
    ))).toHaveLength(4)
  })

  it('hides the authored count until the player is added and always totals twelve', () => {
    expect(Object.values(elevenMinutesDeliberation.firstBallot).reduce((a, b) => a + b, 0)).toBe(11)
    expect(aggregateFirstBallot(elevenMinutesDeliberation, 'murder')).toEqual({
      murder: 5, manslaughter: 4, 'not-guilty': 2, 'unable-to-agree': 1,
    })
  })

  it('reveals the first aggregate in its scene from the persisted sealed vote', () => {
    expect(firstBallotForScene(elevenMinutesDeliberation, 'sat-provisional', 'murder')).toBeNull()
    expect(firstBallotForScene(elevenMinutesDeliberation, 'sat-first-ballot')).toBeNull()
    const aggregate = firstBallotForScene(elevenMinutesDeliberation, 'sat-first-ballot', 'murder')
    expect(aggregate).toEqual({ murder: 5, manslaughter: 4, 'not-guilty': 2, 'unable-to-agree': 1 })
    expect(Object.values(aggregate ?? {}).reduce((sum, count) => sum + count, 0)).toBe(12)
  })

  it('moves no more than one anonymous authored vote per lawful contribution', () => {
    const proposition = elevenMinutesDeliberation.propositions[0]
    const afterOne = evolveAuthoredBallot(elevenMinutesDeliberation.firstBallot, [proposition])
    const afterTwo = evolveAuthoredBallot(elevenMinutesDeliberation.firstBallot, [proposition, proposition])
    expect(afterOne.murder).toBe(5)
    expect(afterTwo.murder).toBe(6)
    expect(Object.values(afterTwo).reduce((a, b) => a + b, 0)).toBe(11)
  })

  it.each(elevenMinutesDeliberation.improperArguments)(
    'corrects and removes influence from the authored improper claim "$claim"',
    (improper) => {
      const proposition = elevenMinutesDeliberation.propositions.find(({ id }) => id === 'prop-improper-boundary')!
      const assessment = assessReasoningContribution(elevenMinutesDeliberation, {
        propositionId: proposition.id,
        sceneId: 'sat-improper',
        legalQuestion: proposition.legalQuestion,
        evidenceId: proposition.evidenceIds[0],
        move: proposition.moves[0],
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

  it('derives movement from the authored proposition, never the player ballot', () => {
    const lawful = contributions(['sat-room'], 'prop-causation-window-doubt')
    expect(calculateSecondBallot(elevenMinutesDeliberation, 'murder', lawful)).toMatchObject({
      murder: 5,
      'not-guilty': 3,
    })
  })

  it('supports counter-direction and no-effect authored propositions', () => {
    const counter = contributions(['sat-room'], 'prop-negligence-safety-alternative')
    const noEffect = contributions(['sat-concerns'], 'prop-intent-source-limit')
    expect(calculateSecondBallot(elevenMinutesDeliberation, 'murder', counter)).toMatchObject({ manslaughter: 3, 'not-guilty': 3 })
    expect(calculateSecondBallot(elevenMinutesDeliberation, 'murder', noEffect)).toEqual(
      aggregateFirstBallot(elevenMinutesDeliberation, 'murder'),
    )
  })

  it.each([
    ['murder', 'majority'],
    ['manslaughter', 'unanimous'],
    ['not-guilty', 'majority'],
  ] as const)('can reach a deterministic %s outcome', (verdict, agreement) => {
    const result = finalResult(verdict)
    expect(result.verdict).toBe(verdict)
    expect(result.agreement).toBe(agreement)
    expect(result.aggregate[verdict]).toBe(agreement === 'unanimous' ? 12 : 11)
  })

  it('offers only scene-reviewed topics while preserving evidence and move choices', () => {
    const causationScene = elevenMinutesDeliberation.propositions.filter(({ sceneIds }) => (
      sceneIds.includes('sat-causation')
    ))
    expect(causationScene).not.toHaveLength(0)
    expect(causationScene.every(({ legalQuestion }) => legalQuestion.startsWith('Did that omission'))).toBe(true)
    elevenMinutesDeliberation.propositions.forEach((proposition) => {
      expect(proposition.evidenceIds.length).toBeGreaterThanOrEqual(2)
      expect(proposition.moves.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('returns a hung jury without a direction or further discussion', () => {
    expect(finalResult('murder', false).agreement).toBe('hung')
    expect(finalResult('unable-to-agree').verdict).toBe('unable-to-agree')
  })

  it('ignores addresses, unknown scenes and duplicate scene contributions', () => {
    const baseline = contributions(['sat-room'])
    const polluted = [
      ...baseline,
      { ...baseline[0], sceneId: 'fri-crown-close' },
      { ...baseline[0], sceneId: 'forged-scene' },
      { ...baseline[0], recordedAt: '2026-08-15T11:00:00+10:00' },
    ]
    expect(calculateSecondBallot(elevenMinutesDeliberation, 'murder', polluted)).toEqual(
      calculateSecondBallot(elevenMinutesDeliberation, 'murder', baseline),
    )
  })

  it('rejects unknown or tuple-mismatched proposition input', () => {
    const lawful = contributions(['sat-room'])[0]
    expect(() => assessReasoningContribution(elevenMinutesDeliberation, {
      ...lawful,
      propositionId: 'prop-unknown',
    })).toThrow(/not part of the reviewed deliberation/i)
    expect(() => assessReasoningContribution(elevenMinutesDeliberation, {
      ...lawful,
      evidenceId: 'ex-warning',
    })).toThrow(/not part of the reviewed deliberation/i)
    expect(() => assessReasoningContribution(elevenMinutesDeliberation, {
      ...lawful,
      sceneId: 'sat-causation',
    })).toThrow(/not part of the reviewed deliberation/i)
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
