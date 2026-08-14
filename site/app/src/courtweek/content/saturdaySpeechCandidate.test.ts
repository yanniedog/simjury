import { describe, expect, it } from 'vitest'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeechCue, findPotentialAttributions } from './speechReview'
import {
  SATURDAY_SOURCE_CUE_IDS,
  SATURDAY_SPEECH_CANDIDATE,
  type SaturdaySourceCueId,
} from './saturdaySpeechCandidate'
import { TUESDAY_SPEECH_CANDIDATE } from './tuesdaySpeechCandidate'
import { WEDNESDAY_SPEECH_CANDIDATE } from './wednesdaySpeechCandidate'

const activeSaturday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-saturday')
if (!activeSaturday) throw new Error('Active Saturday session is missing')

const activeSourceCueIds = [...new Set(
  activeSaturday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function cueById(id: SaturdaySourceCueId) {
  const candidate = SATURDAY_SPEECH_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error('Missing Saturday candidate cue ' + id)
  return candidate
}

describe('inactive Saturday reviewed speech candidate', () => {
  it('covers every active Saturday authored source cue exactly once', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...SATURDAY_SOURCE_CUE_IDS].sort())
    expect(SATURDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).toEqual(SATURDAY_SOURCE_CUE_IDS)
    expect(new Set(SATURDAY_SPEECH_CANDIDATE.map(({ sourceCueId }) => sourceCueId)).size).toBe(19)
    const turnIds = SATURDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(24)
    expect(new Set(turnIds).size).toBe(turnIds.length)
  })

  it('validates every explicit turn and contains no hidden or anonymous speaker', () => {
    for (const candidate of SATURDAY_SPEECH_CANDIDATE) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toEqual([])
      expect(candidate.sourceText).toBe(candidate.turns.map(({ text }) => text).join(' '))
      expect(candidate.sourceText).not.toMatch(/Someone says|Another voice asks/i)
    }
  })

  it.each([
    ['Sola hand-off', 'Sola Iven answers that the beacon matters.'],
    ['Kessa hand-off', 'Kessa answers immediately: the Judge forbade it.'],
    ['Yara hand-off', 'Yara Merrow asks what permanent logging means.'],
    ['anonymous claim', 'Someone says that silence proves guilt.'],
    ['anonymous question', 'Another voice asks what sentence follows.'],
  ])('fails closed if an undeclared %s is embedded in a cue', (_label, hiddenSpeech) => {
    const candidate = cueById('sat-concerns-1')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: candidate.sourceText + ' ' + hiddenSpeech,
    })).toThrow(/undeclared attributed speech|unknown attributed speaker/i)
  })

  it('locks actor and legal-action ownership for all twenty-four turns', () => {
    const ownership = Object.fromEntries(SATURDAY_SPEECH_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => actorId + ':' + legalAction),
    ]))
    expect(ownership).toEqual({
      'sat-room-1': ['edda-rook:none'], 'sat-room-2': ['niko-hale:none'],
      'sat-room-3': ['lina-fei:none'],
      'sat-concerns-1': ['ari-tem:none', 'sola-iven:none'],
      'sat-concerns-2': ['bram-tey:none', 'kessa-noor:none'],
      'sat-concerns-3': ['daro-sen:none', 'yara-merrow:none'],
      'sat-provisional-direction': ['edda-rook:ballot-administration'],
      'sat-provisional-vote': ['court-officer:ballot-administration'],
      'sat-first-ballot': ['edda-rook:ballot-administration'],
      'sat-ballot-process': ['omri-cade:none'],
      'sat-causation-1': ['niko-hale:none'], 'sat-causation-2': ['toma-reed:none'],
      'sat-causation-3': ['edda-rook:none'],
      'sat-improper-1': ['bram-tey:none', 'kessa-noor:none'],
      'sat-improper-2': ['sola-iven:none', 'edda-rook:none'],
      'sat-jury-note': ['edda-rook:jury-note'],
      'sat-judge-response': ['judge:direction'],
      'sat-separate-1': ['judge:direction'], 'sat-separate-2': ['narrator:narration'],
    })
  })

  it('splits exactly the five concealed hand-off cues into their real jurors', () => {
    expect([
      'sat-concerns-1', 'sat-concerns-2', 'sat-concerns-3', 'sat-improper-1', 'sat-improper-2',
    ].map((id) => cueById(id as SaturdaySourceCueId).turns.map(({ actorId }) => actorId))).toEqual([
      ['ari-tem', 'sola-iven'], ['bram-tey', 'kessa-noor'], ['daro-sen', 'yara-merrow'],
      ['bram-tey', 'kessa-noor'], ['sola-iven', 'edda-rook'],
    ])
    const directJurors = new Set(SATURDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
      .map(({ actorId }) => actorId).filter((actorId) => actorId.endsWith('-rook') || [
        'niko-hale', 'lina-fei', 'ari-tem', 'sola-iven', 'bram-tey', 'kessa-noor',
        'daro-sen', 'yara-merrow', 'toma-reed', 'omri-cade',
      ].includes(actorId)))
    expect([...directJurors].sort()).toEqual([
      'ari-tem', 'bram-tey', 'daro-sen', 'edda-rook', 'kessa-noor', 'lina-fei',
      'niko-hale', 'omri-cade', 'sola-iven', 'toma-reed', 'yara-merrow',
    ])
  })

  it('locks the complete Saturday chronology from discussion to overnight separation', () => {
    expect(SATURDAY_SPEECH_CANDIDATE.map(({ id, procedureStage }) => id + ':' + procedureStage)).toEqual([
      'sat-room-1:opening-discussion', 'sat-room-2:opening-discussion', 'sat-room-3:opening-discussion',
      'sat-concerns-1:concern-round', 'sat-concerns-2:concern-round', 'sat-concerns-3:concern-round',
      'sat-provisional-direction:provisional-ballot-direction', 'sat-provisional-vote:sealed-player-ballot',
      'sat-first-ballot:first-aggregate', 'sat-ballot-process:first-aggregate',
      'sat-causation-1:evidence-testing', 'sat-causation-2:evidence-testing', 'sat-causation-3:evidence-testing',
      'sat-improper-1:improper-argument-correction', 'sat-improper-2:improper-argument-correction',
      'sat-jury-note:jury-note', 'sat-judge-response:open-court-answer',
      'sat-separate-1:overnight-separation', 'sat-separate-2:overnight-separation',
    ])
    expect(SATURDAY_SPEECH_CANDIDATE.some(({ event }) => [
      'second-ballot', 'perseverance-direction', 'majority-direction', 'final-ballot',
    ].includes(event))).toBe(false)
  })

  it('seals the player ballot before showing only an anonymous aggregate', () => {
    const ballotTurns = SATURDAY_SPEECH_CANDIDATE.flatMap(({ id, turns }) => turns
      .filter(({ legalAction }) => legalAction === 'ballot-administration').map((turn) => ({ cueId: id, ...turn })))
    expect(ballotTurns.map(({ cueId, actorId }) => cueId + ':' + actorId)).toEqual([
      'sat-provisional-direction:edda-rook', 'sat-provisional-vote:court-officer',
      'sat-first-ballot:edda-rook',
    ])
    expect(cueById('sat-provisional-direction').sourceText).toMatch(/private provisional ballot.*not a verdict.*individual selection.*Before the aggregate/is)
    expect(cueById('sat-provisional-vote').sourceText).toMatch(/choice seals when submitted/is)
    expect(cueById('sat-first-ballot').sourceText).toMatch(/anonymous aggregate.*No seat is identified.*largest group.*not how to resolve/is)
  })

  it('gives the written jury note to the foreperson before the Judge answers in open court', () => {
    const note = cueById('sat-jury-note').turns[0]
    expect(note).toMatchObject({ actorId: 'edda-rook', speechMode: 'written-text-read', legalAction: 'jury-note' })
    expect(note?.text).toMatch(/no ballot numbers or juror identities/is)
    expect(cueById('sat-judge-response').turns[0]).toMatchObject({ actorId: 'judge', speechMode: 'judicial-direction', legalAction: 'direction' })
    expect(cueById('sat-judge-response').sourceText).toMatch(/^No\..*possible.*does not satisfy s 18.*s 22 asks separately/is)
    expect(SATURDAY_SOURCE_CUE_IDS.indexOf('sat-jury-note')).toBeLessThan(SATURDAY_SOURCE_CUE_IDS.indexOf('sat-judge-response'))
  })

  it('records every literal quotation with exact source provenance', () => {
    const allTurns = SATURDAY_SPEECH_CANDIDATE.flatMap(({ turns }) => turns)
    const provenance = allTurns.flatMap((turn) => (turn.quotedSpans ?? []).map((span) =>
      turn.id + '|' + turn.text.slice(span.start, span.end) + '|' + span.source + '|' + (span.sourceActorId ?? '-')))
    expect(provenance).toEqual([
      'sat-room-2__1|“probably”|reported|eren-vos',
      'sat-concerns-1__2|“No. Seventy-one waits.”|reported|accused',
      'sat-jury-note__1|“For murder, if we find the controller deliberately held the craft while aware that death was a possible result, is awareness of that risk enough to prove the required intent? Please restate the difference between murder and manslaughter.”|written|-',
    ])
    expect(WEDNESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'wed-vos-chief-1')?.sourceText).toContain('probably')
    expect(TUESDAY_SPEECH_CANDIDATE.find(({ id }) => id === 'tue-dorn-chief-2')?.sourceText).toContain('“No. Seventy-one waits.”')
    expect(allTurns.find(({ id }) => id === 'sat-jury-note__1')?.text).toContain('“' + elevenMinutesDeliberation.juryNote.question + '”')
    for (const turn of allTurns) {
      const literalQuotes = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
      const reviewedQuotes = (turn.quotedSpans ?? []).map((span) => turn.text.slice(span.start, span.end))
      expect(reviewedQuotes, turn.id).toEqual(literalQuotes)
      for (const quote of reviewedQuotes) {
        expect(turn.text.indexOf(quote), `${turn.id}: ${quote}`).toBe(turn.text.lastIndexOf(quote))
      }
    }
  })
})
