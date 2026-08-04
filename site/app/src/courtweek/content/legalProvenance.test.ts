import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from './elevenMinutes'

function cueText(cueId: string): string {
  for (const session of elevenMinutesCourtWeek.manifest.sessions) {
    for (const scene of session.scenes) {
      const cue = scene.cues.find(({ id }) => id === cueId)
      if (cue) return `${cue.text} ${cue.accessibleProposition}`
    }
  }
  throw new Error(`Missing cue ${cueId}`)
}

describe('Eleven Minutes legal provenance', () => {
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
})
