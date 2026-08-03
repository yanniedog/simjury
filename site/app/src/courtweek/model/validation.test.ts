import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { initialLegalState, transitionLegalState, validateCourtWeek } from './validation'

describe('Eleven Minutes Court Week', () => {
  it('is one fiction-labelled seven-session week in sequential court time', () => {
    const { manifest } = elevenMinutesCourtWeek
    expect(manifest.id).toBe('cw-0001')
    expect(manifest.label).toBe('fiction')
    expect(manifest.sessions.map((session) => session.day)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ])
    expect(manifest.sessions.slice(1).every((session, index) =>
      session.prerequisiteSessionIds[0] === manifest.sessions[index].id)).toBe(true)
  })

  it('computes every session inside the 18–22 minute gate', () => {
    const { durationSeconds } = validateCourtWeek(elevenMinutesCourtWeek)
    expect(Object.values(durationSeconds)).toHaveLength(7)
    Object.values(durationSeconds).forEach((seconds) => expect(seconds).toBeGreaterThanOrEqual(1080))
    Object.values(durationSeconds).forEach((seconds) => expect(seconds).toBeLessThanOrEqual(1320))
  })

  it('pins the three Orinth legal provisions and ordered alternative verdicts', () => {
    expect(elevenMinutesCourtWeek.trial.offences.map((offence) => offence.id)).toEqual([
      'orinth-cc-s18', 'orinth-cc-s22', 'orinth-eca-s41',
    ])
    expect(elevenMinutesCourtWeek.deliberation.outcomePaths.map((path) => path.verdict)).toEqual([
      'murder', 'manslaughter', 'not-guilty', 'unable-to-agree',
    ])
  })

  it('contains the required objection variety and exactly one inaccessible struck item', () => {
    const objections = elevenMinutesCourtWeek.trial.objections
    expect(objections).toEqual(expect.arrayContaining([
      expect.objectContaining({ madeBy: 'Defence', ruling: 'overruled' }),
      expect.objectContaining({ madeBy: 'Crown', timing: 'pre-answer', ruling: 'sustained' }),
      expect.objectContaining({ timing: 'post-answer', ruling: 'sustained', struckEvidenceId: 'struck-rumour' }),
    ]))
    const struck = elevenMinutesCourtWeek.trial.evidence.filter((evidence) => evidence.status === 'struck')
    expect(struck).toHaveLength(1)
    expect(struck[0].replayable).toBe(false)
    const cited = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues).flatMap((cue) => cue.evidenceIds)
    expect(cited).not.toContain('struck-rumour')
  })

  it('keeps the accused silent and confines every re-examination to a declared scope', () => {
    expect(elevenMinutesCourtWeek.trial.accusedTestifies).toBe(false)
    elevenMinutesCourtWeek.trial.witnesses.forEach((witness) => {
      if (witness.reexaminationCueIds.length > 0) expect(witness.reexaminationScope.length).toBeGreaterThan(0)
    })
  })

  it('uses eleven private authored jurors and unlocks majority only after safeguards', () => {
    const { deliberation } = elevenMinutesCourtWeek
    expect(deliberation.jurors).toHaveLength(11)
    expect(Object.values(deliberation.firstBallot).reduce((a, b) => a + b, 0)).toBe(11)
    expect(deliberation.majorityGate).toEqual({
      minimumElapsedCourtHours: 8.25,
      requiresFailedUnanimity: true,
      requiresFurtherDiscussion: true,
      threshold: 11,
    })
  })

  it('fails closed when evidence is attempted before the oath', () => {
    expect(() => transitionLegalState(initialLegalState, 'witness-chief')).toThrow(/before oath/)
  })

  it('exposes an equivalent proposition for every audio-visual cue', () => {
    elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues)
      .forEach((cue) => expect(cue.accessibleProposition.trim().length).toBeGreaterThan(20))
  })
})
