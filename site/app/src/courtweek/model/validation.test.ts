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

  it('reports authored speech duration without a padding contract', () => {
    const { durationSeconds } = validateCourtWeek(elevenMinutesCourtWeek)
    expect(Object.values(durationSeconds)).toHaveLength(7)
    Object.values(durationSeconds).forEach((seconds) => expect(seconds).toBeGreaterThan(0))
    expect(Object.values(durationSeconds).reduce((total, seconds) => total + seconds, 0)).toBeLessThan(7 * 18 * 60)
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

  it('traces every closing proposition to admitted exhibits or identified testimony', () => {
    const closingCues = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues)
      .filter(({ event }) => event === 'crown-closing' || event === 'defence-closing')

    expect(closingCues).toHaveLength(4)
    expect(closingCues.every(({ closingPropositions }) => (closingPropositions ?? []).length > 0)).toBe(true)
    expect(closingCues.flatMap(({ closingPropositions }) => closingPropositions ?? [])).toHaveLength(15)
    closingCues.forEach((cue) => (cue.closingPropositions ?? []).forEach((proposition) => {
      expect(cue.text).toContain(proposition.text)
      expect(proposition.recordSources.length).toBeGreaterThan(0)
    }))

    const proposition = (id: string) => closingCues.flatMap(({ closingPropositions }) => closingPropositions ?? [])
      .find((candidate) => candidate.id === id)
    expect(proposition('crown-launch-availability')?.recordSources).toContainEqual({ kind: 'testimony', cueId: 'thu-quill-cross-1' })
    expect(proposition('defence-grossness-context')?.recordSources).toContainEqual({ kind: 'testimony', cueId: 'thu-quill-re-1' })
    expect(proposition('crown-motive')?.recordSources).toContainEqual({ kind: 'testimony', cueId: 'wed-vale-chief-1' })
  })

  it('rejects missing, struck or unadmitted closing sources', () => {
    const missing = structuredClone(elevenMinutesCourtWeek)
    const missingClosing = missing.manifest.sessions[4].scenes
      .flatMap(({ cues }) => cues).find(({ id }) => id === 'fri-crown-closing-1')!
    missingClosing.closingPropositions = []
    expect(() => validateCourtWeek(missing)).toThrow(/every closing cue requires proposition-level record sources/i)

    const struckTestimony = structuredClone(elevenMinutesCourtWeek)
    const testimonyClosing = struckTestimony.manifest.sessions[4].scenes
      .flatMap(({ cues }) => cues).find(({ id }) => id === 'fri-defence-closing-1')!
    const testimonyProposition = testimonyClosing.closingPropositions
      ?.find(({ id }) => id === 'defence-error-mechanism')
    if (!testimonyProposition) throw new Error('Defence testimony traceability fixture is missing.')
    testimonyProposition.recordSources = [{ kind: 'testimony', cueId: 'wed-blurt' }]
    expect(() => validateCourtWeek(struckTestimony)).toThrow(/testimony source wed-blurt was struck/i)

    const struckExhibit = structuredClone(elevenMinutesCourtWeek)
    const exhibitClosing = struckExhibit.manifest.sessions[4].scenes
      .flatMap(({ cues }) => cues).find(({ id }) => id === 'fri-crown-closing-2')!
    const exhibitProposition = exhibitClosing.closingPropositions
      ?.find(({ id }) => id === 'crown-motive')
    if (!exhibitProposition) throw new Error('Crown exhibit traceability fixture is missing.')
    exhibitProposition.recordSources = [{ kind: 'exhibit', evidenceId: 'struck-rumour' }]
    expect(() => validateCourtWeek(struckExhibit)).toThrow(/exhibit source struck-rumour is not admitted/i)
  })

  it('rejects unlisted closing claims and a strike attached to the wrong answer', () => {
    const unlisted = structuredClone(elevenMinutesCourtWeek)
    const closing = unlisted.manifest.sessions[4].scenes
      .flatMap(({ cues }) => cues).find(({ id }) => id === 'fri-crown-closing-1')!
    closing.text += ' A new factual assertion appears without a source.'
    expect(() => validateCourtWeek(unlisted)).toThrow(/unlisted closing text has no admitted-record source/i)

    const wrongAnswer = structuredClone(elevenMinutesCourtWeek)
    const strike = wrongAnswer.trial.objections.find(({ id }) => id === 'obj-3')!
    strike.struckCueId = 'wed-vale-cross-1'
    expect(() => validateCourtWeek(wrongAnswer)).toThrow(/post-answer ruling must immediately follow its excluded answer/i)
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

  it('binds every admitted replayable recording to its exact evidence cue', () => {
    const recording = elevenMinutesCourtWeek.trial.evidence.find((evidence) => evidence.id === 'ex-distress')
    expect(recording?.replaySourceCueId).toBe('tue-recording-play')

    const unbound = structuredClone(elevenMinutesCourtWeek)
    const unboundRecording = unbound.trial.evidence.find((evidence) => evidence.id === 'ex-distress')
    if (!unboundRecording) throw new Error('Recording fixture is missing.')
    delete unboundRecording.replaySourceCueId
    expect(() => validateCourtWeek(unbound)).toThrow(/requires an exact replay source cue/i)
  })

  it('completes the recording, log, strip and snapshot foundations through Mir', () => {
    const allCues = elevenMinutesCourtWeek.manifest.sessions.flatMap((session) => session.scenes)
      .flatMap((scene) => scene.cues)
    const mir = elevenMinutesCourtWeek.trial.witnesses.find((witness) => witness.id === 'w-mir')
    const foundation = allCues.filter((cue) => (
      mir?.chiefCueIds.includes(cue.sourceCueId ?? cue.id)
    ))
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
