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

  it('fails when a substantive witness cue is missing from that witness record', () => {
    const orphaned = structuredClone(elevenMinutesCourtWeek)
    const vale = orphaned.trial.witnesses.find((witness) => witness.id === 'w-vale')
    if (!vale) throw new Error('Vale fixture is missing.')
    vale.crossCueIds = vale.crossCueIds.filter((id) => id !== 'wed-blurt')
    expect(() => validateCourtWeek(orphaned)).toThrow(/substantive witness cue wed-blurt/i)
  })

  it('requires a later final admission for every provisionally admitted exhibit', () => {
    const unfinished = structuredClone(elevenMinutesCourtWeek)
    const finalCue = unfinished.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues).find((cue) => cue.id === 'tue-recording-final-admission')
    if (!finalCue) throw new Error('Recording final-admission fixture is missing.')
    delete finalCue.admissionStatus
    expect(() => validateCourtWeek(unfinished)).toThrow(/provisional admission requires a later final-admission cue/i)
  })

  it('completes the recording, log, strip and snapshot foundations through Mir', () => {
    const allCues = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues)
    const mir = elevenMinutesCourtWeek.trial.witnesses.find((witness) => witness.id === 'w-mir')
    const foundation = allCues.filter((cue) => mir?.chiefCueIds.includes(cue.id))
      .map((cue) => cue.text).join(' ')
    expect(foundation).toMatch(/SHA-256 hash matches the write-once archive/i)
    expect(foundation).toMatch(/no erasure, overwriting or alteration/i)
    expect(foundation).toMatch(/copy is complete and unedited/i)
    expect(foundation).toMatch(/snapshot.+complete/i)

    const provisional = allCues.find((cue) => cue.id === 'tue-recording-foundation')
    const final = allCues.find((cue) => cue.id === 'tue-recording-final-admission')
    expect(provisional?.admissionStatus).toBe('provisional')
    expect(final?.admissionStatus).toBe('final')
    expect(allCues.indexOf(final!)).toBeGreaterThan(allCues.indexOf(provisional!))
  })

  it('records the Pell, Vale and Quill testimony and confines Quill to operations', () => {
    const witnesses = elevenMinutesCourtWeek.trial.witnesses
    expect(witnesses.find((witness) => witness.id === 'w-pell')?.chiefCueIds).toContain('wed-ready-admitted')
    expect(witnesses.find((witness) => witness.id === 'w-vale')?.crossCueIds).toContain('wed-blurt')
    expect(witnesses.find((witness) => witness.id === 'w-quill')?.chiefCueIds).toContain('thu-warning-admitted')

    const quillReexamination = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues).find((cue) => cue.id === 'thu-quill-re-1')
    expect(quillReexamination?.text).toMatch(/what operational information could you have supplied/i)
    expect(quillReexamination?.text).not.toMatch(/legal authority|acted reasonably/i)
  })

  it('formally tenders the incident export without recalling Mir after cross-examination', () => {
    const tender = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues).find((cue) => cue.id === 'wed-record-admitted')
    expect(tender).toEqual(expect.objectContaining({
      event: 'exhibit-admitted',
      speaker: 'Crown counsel Asha Renn',
      admissionStatus: 'final',
    }))
    expect(tender?.text).toMatch(/foundation tested yesterday/i)
  })

  it('does not disguise defence argument as witness re-examination before addresses', () => {
    const cue = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues).find((item) => item.id === 'thu-defence-theory')
    expect(cue).toEqual(expect.objectContaining({
      event: 'preliminary-direction', speaker: 'Judge Sel Aven', tone: 'ruling',
    }))
    expect(cue?.text).toMatch(/procedural information, not evidence and not a final address/i)
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
