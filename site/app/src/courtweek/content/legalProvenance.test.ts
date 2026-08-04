import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from './elevenMinutes'
import { courtWeekBootstrap } from '../sealed/bootstrap'
import { createCourtDayPacks } from '../sealed/packPlan'

function cueText(cueId: string): string {
  for (const session of elevenMinutesCourtWeek.manifest.sessions) {
    for (const scene of session.scenes) {
      const cue = scene.cues.find(({ id }) => id === cueId)
      if (cue) {
        const sourceText = scene.cues
          .filter(({ id, sourceCueId }) => id === cueId || sourceCueId === cueId)
          .map(({ text }) => text)
          .join(' ')
        return `${sourceText} ${cue.accessibleProposition}`
      }
    }
  }
  throw new Error(`Missing cue ${cueId}`)
}

describe('Eleven Minutes legal provenance', () => {
  const orderedCues = elevenMinutesCourtWeek.manifest.sessions.flatMap(({ scenes }) =>
    scenes.flatMap(({ cues }) => cues),
  )

  it('does not reveal legal submissions made outside the jury\'s presence', () => {
    const jurorWaiting = `${cueText('fri-submissions-1')} ${cueText('fri-submissions-2')}`
    expect(jurorWaiting).toMatch(/do not speculate/i)
    expect(jurorWaiting).not.toMatch(/Crown accepts|defence obtains|judge rejects|proposed direction/i)
  })

  it('does not turn available clarification into an unproved absence of contact', () => {
    const reviewed = [
      cueText('fri-crown-closing-1'),
      cueText('sat-room-3'),
      cueText('sun-negligence-1'),
      ...elevenMinutesCourtWeek.deliberation.outcomePaths.flatMap(({ lawfulRationale, counterAnalysis }) => [lawfulRationale, counterAnalysis]),
    ].join(' ')
    expect(reviewed).not.toMatch(/no clarification|without call|absence of inquiry/i)
    expect(reviewed).toMatch(/clarification was available|available clarification|advice was available/i)
  })

  it('states material acceleration and preserves the expert travel assumptions as unproved', () => {
    expect(cueText('wed-resume-2')).toMatch(/materially accelerates|materially postponed/i)
    expect(cueText('sat-causation-2')).toMatch(/neither invent a breakdown nor assume an interruption-free journey was proved/i)
    expect(elevenMinutesCourtWeek.deliberation.outcomePaths.find(({ verdict }) => verdict === 'murder')?.lawfulRationale)
      .not.toMatch(/uneventful launch route/i)
  })

  it('rules on the review evidence before Vale answers and formally admits the document', () => {
    const objectionIndex = orderedCues.findIndex(({ id }) => id === 'wed-def-objection')
    const answerIndex = orderedCues.findIndex(({ id }) => id === 'wed-vale-chief-1')
    const admittedReview = orderedCues[answerIndex]

    expect(objectionIndex).toBeGreaterThanOrEqual(0)
    expect(answerIndex).toBeGreaterThan(objectionIndex)
    expect(admittedReview).toMatchObject({
      event: 'exhibit-admitted',
      admissionStatus: 'final',
      evidenceIds: ['ex-review'],
    })
  })

  it('does not ship the warning document before its Thursday admission', () => {
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    const warningPack = packs.find(({ evidence }) => evidence.some(({ id }) => id === 'ex-warning'))
    const pellScene = elevenMinutesCourtWeek.manifest.sessions[2].scenes.find(({ id }) => id === 'wed-pell-chief')

    expect(warningPack?.ordinal).toBe(4)
    expect(pellScene?.interaction?.prompt).toMatch(/Pell’s oral evidence/i)
    expect(warningPack?.session.scenes.flatMap(({ cues }) => cues).some(
      ({ event, evidenceIds }) => event === 'exhibit-admitted' && evidenceIds.includes('ex-warning'),
    )).toBe(true)
  })

  it('keeps the single Crown objection and the sustained Defence objection in credible examinations', () => {
    const chiefStart = orderedCues.findIndex(({ id }) => id === 'tue-dorn-chief-1')
    const defenceObjection = orderedCues.findIndex(({ id }) => id === 'tue-def-objection')
    const chiefAnswer = orderedCues.findIndex(({ id }) => id === 'tue-dorn-chief-2')
    const crownObjections = elevenMinutesCourtWeek.trial.objections.filter(({ madeBy }) => madeBy === 'Crown')

    expect(chiefStart).toBeLessThan(defenceObjection)
    expect(defenceObjection).toBeLessThan(chiefAnswer)
    expect(cueText('tue-def-objection')).toMatch(/Dax: Objection.*hearsay.*Sustained before the witness answers/is)
    expect(orderedCues[defenceObjection].tone).toBe('chief')
    expect(crownObjections).toHaveLength(1)
    expect(crownObjections[0].cueId).toBe('thu-crown-objection')
  })

  it('keeps the route exhibit within its authenticated visual scope', () => {
    expect(cueText('mon-orr-chief-2')).toMatch(/does not show.*other incidents or craft assignments/i)
    expect(cueText('mon-orr-chief-2')).not.toMatch(/shown east|rescue was already assigned/i)
  })

  it('lays concise expert foundations without conceding the defence case or inventing concealment', () => {
    expect(cueText('wed-vos-chief-1')).toMatch(/fourteen years.*accepted immersion datasets.*both sides received/is)
    expect(cueText('thu-rusk-chief-1')).toMatch(/twelve years.*reviewed.*did not interview or diagnose/is)
    expect(cueText('thu-def-opening')).not.toMatch(/grave failure|admits a serious failure/i)
    expect(cueText('thu-def-opening')).toMatch(/intention to cause death or really serious injury/i)
    expect(cueText('thu-rusk-chief-2')).not.toMatch(/disguise|conceal/i)
  })

  it('gives both sides a separate, evidence-bound manslaughter submission', () => {
    const crownClosing = cueText('fri-crown-closing-2')
    const defenceClosing = cueText('fri-defence-closing-2')

    expect(crownClosing).toMatch(/manslaughter separately.*never as a compromise/is)
    expect(crownClosing).toMatch(/caused death.*so far below reasonable care.*high a risk.*merits criminal punishment/is)
    expect(crownClosing).not.toMatch(/survival chance closed|knew when a survival window would close[^;]*\./i)
    expect(defenceClosing).toMatch(/manslaughter is not a compromise/is)
    expect(defenceClosing).toMatch(/caused death.*so far below reasonable care.*high a risk.*merits criminal punishment/is)
    expect(defenceClosing).toMatch(/warning.*overloaded.*ambiguous READY/is)
  })

  it('authorises Friday separation in court after retirement begins and before any ballot', () => {
    const retirementIndex = orderedCues.findIndex(({ id }) => id === 'fri-retire')
    const separationIndex = orderedCues.findIndex(({ id }) => id === 'fri-adjourn')
    const separation = orderedCues[separationIndex]

    expect(retirementIndex).toBeGreaterThanOrEqual(0)
    expect(separationIndex).toBeGreaterThan(retirementIndex)
    expect(separation).toMatchObject({ speaker: 'Judge Sel Aven', tone: 'ruling', event: 'adjournment' })
    expect(cueText('fri-adjourn')).toMatch(/taken no ballot.*authorise you to separate.*do not discuss or research/is)
  })

  it('keeps the final ballot entirely in-world and protects private positions', () => {
    const finalBallot = cueText('sun-final-ballot')

    expect(finalBallot).not.toMatch(/authored jurors|random tie|update gradually|player/i)
    expect(finalBallot).toMatch(/final position in private.*all twelve agree.*eleven agree.*no lawful agreement/is)
    expect(finalBallot).toMatch(/no seat is identified/i)
  })

  it('gives the weekend room a direct, balanced account of each live inference', () => {
    expect(cueText('sat-causation-1')).toMatch(/conscious near 21:16.*persuasive without certainty.*possibility reasonable/is)
    expect(cueText('sun-resume-2')).toMatch(/removes a shortcut.*does not erase.*may support.*point the other way/is)
    expect(cueText('sun-negligence-2')).toMatch(/may support grossness.*genuine rescuer risk.*point against.*reasonable doubt/is)
  })

  it('keeps the strongest verdict analyses within the facts the jury could find', () => {
    const murder = elevenMinutesCourtWeek.deliberation.outcomePaths.find(({ verdict }) => verdict === 'murder')!
    const manslaughter = elevenMinutesCourtWeek.deliberation.outcomePaths.find(({ verdict }) => verdict === 'manslaughter')!

    expect(murder.lawfulRationale).toMatch(/expressed fear that Saye’s unfinished review threatened her career/i)
    expect(murder.lawfulRationale).not.toMatch(/proved knowledge of the audit/i)
    expect(murder.counterAnalysis).toMatch(/memorandum was unfinished and unseen.*did not prove she knew its recommendation/i)
    expect(manslaughter.lawfulRationale).toMatch(/nearest launch-capable craft while AR-71 had no craft assigned/i)
    expect(manslaughter.lawfulRationale).not.toMatch(/only unassigned nearest craft/i)
  })
})
