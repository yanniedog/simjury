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
})
