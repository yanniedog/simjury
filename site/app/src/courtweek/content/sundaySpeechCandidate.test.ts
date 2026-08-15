import { describe, expect, it } from 'vitest'
import { openCourtReturnTurns } from '../engine/deliberation'
import { authoredCueSourceId } from './captionPacing'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesSessions } from './sessions'
import {
  assertReviewedSpeechCue,
  COURT_WEEK_ACTORS,
  findPotentialAttributions,
} from './speechReview'
import {
  SUNDAY_ANALYSIS_CANDIDATES,
  SUNDAY_BALLOT_BRANCHES,
  SUNDAY_DYNAMIC_SOURCE_CUE_IDS,
  SUNDAY_PROCEDURE_CANDIDATE,
  SUNDAY_RETURN_CANDIDATES,
  SUNDAY_SOURCE_CUE_IDS,
} from './sundaySpeechCandidate'

const activeSunday = elevenMinutesSessions.find(({ id }) => id === 'cw-0001-sunday')
if (!activeSunday) throw new Error('Active Sunday session is missing')
const activeSourceCueIds = [...new Set(
  activeSunday.scenes.flatMap(({ cues }) => cues.map(authoredCueSourceId)),
)]

function procedureById(id: string) {
  const candidate = SUNDAY_PROCEDURE_CANDIDATE.find((cue) => cue.id === id)
  if (!candidate) throw new Error('Missing Sunday candidate cue ' + id)
  return candidate
}

const allCandidates = [
  ...SUNDAY_PROCEDURE_CANDIDATE,
  ...SUNDAY_RETURN_CANDIDATES,
  ...SUNDAY_ANALYSIS_CANDIDATES,
]

describe('inactive Sunday reviewed speech candidate', () => {
  it('covers all sixteen active source cues through explicit static or branch data', () => {
    expect([...activeSourceCueIds].sort()).toEqual([...SUNDAY_SOURCE_CUE_IDS].sort())
    const procedureSources = SUNDAY_PROCEDURE_CANDIDATE
      .map(({ sourceCueId }) => sourceCueId).filter((id) => id !== null)
    const dynamicSourceIds = new Set<string>(SUNDAY_DYNAMIC_SOURCE_CUE_IDS)
    const staticSourceIds = SUNDAY_SOURCE_CUE_IDS
      .filter((id) => !dynamicSourceIds.has(id))
    expect([...procedureSources].sort()).toEqual([...staticSourceIds].sort())
    expect(SUNDAY_PROCEDURE_CANDIDATE.filter(({ sourceCueId }) => sourceCueId === null)
      .map(({ id }) => id)).toEqual(['sun-fresh-unanimity-ballot'])
    expect(new Set(SUNDAY_RETURN_CANDIDATES.flatMap(({ sourceCueIds }) => sourceCueIds)))
      .toEqual(new Set(['sun-verdict-return', 'sun-verdict-confirm']))
    expect(new Set(SUNDAY_ANALYSIS_CANDIDATES.map(({ sourceCueId }) => sourceCueId)))
      .toEqual(new Set(['sun-analysis']))
  })

  it('validates all twenty-five cues and fifty explicit turns without hidden speech', () => {
    expect(allCandidates).toHaveLength(25)
    const turnIds = allCandidates.flatMap(({ turns }) => turns.map(({ id }) => id))
    expect(turnIds).toHaveLength(50)
    expect(new Set(turnIds).size).toBe(turnIds.length)
    for (const candidate of allCandidates) {
      expect(() => assertReviewedSpeechCue(candidate), candidate.id).not.toThrow()
      expect(findPotentialAttributions(candidate.sourceText), candidate.id).toEqual([])
      expect(candidate.sourceText, candidate.id)
        .toBe(candidate.turns.map(({ text }) => text).join(' '))
      expect(candidate.sourceText, candidate.id).not.toMatch(/Someone says|Another voice asks/i)
    }
  })

  it.each([
    'Edda says the jury is divided.',
    'Judge Sel Aven says a majority is now available.',
    'Clerk asks the foreperson for a verdict.',
    'Someone says the final count aloud.',
    'Another voice asks who dissented.',
  ])('fails closed for attributed speech embedded inside another turn: %s', (hiddenSpeech) => {
    const candidate = procedureById('sun-second-ballot')
    expect(() => assertReviewedSpeechCue({
      ...candidate, sourceText: candidate.sourceText + ' ' + hiddenSpeech,
    })).toThrow(/undeclared attributed speech|unknown attributed speaker/i)
  })

  it('fails closed when verdict, direction or ballot authority is reassigned', () => {
    const returned = SUNDAY_RETURN_CANDIDATES[0]
    const foreperson = returned?.turns[2]
    if (!returned || !foreperson) throw new Error('Return fixture is incomplete')
    expect(() => assertReviewedSpeechCue({
      ...returned,
      turns: returned.turns.map((turn) => turn === foreperson
        ? { ...turn, actorId: 'clerk', displayLabel: 'Clerk' } : turn),
    })).toThrow(/cannot perform verdict-return/i)
    const direction = procedureById('sun-majority-direction')
    expect(() => assertReviewedSpeechCue({
      ...direction,
      turns: [{ ...direction.turns[0]!, actorId: 'edda-rook', displayLabel: 'Edda Rook' }],
    })).toThrow(/cannot perform direction/i)
    const ballot = procedureById('sun-fresh-unanimity-ballot')
    expect(() => assertReviewedSpeechCue({
      ...ballot,
      turns: [{ ...ballot.turns[0]!, actorId: 'judge', displayLabel: 'Judge Sel Aven' }],
    })).toThrow(/cannot perform ballot-administration/i)
  })

  it('locks actor and legal-action ownership across procedure and every return', () => {
    expect(Object.fromEntries(SUNDAY_PROCEDURE_CANDIDATE.map(({ id, turns }) => [
      id, turns.map(({ actorId, legalAction }) => actorId + ':' + legalAction),
    ]))).toEqual({
      'sun-resume-1': ['edda-rook:none'], 'sun-resume-2': ['yara-merrow:none'],
      'sun-negligence-1': ['lina-fei:none'], 'sun-negligence-2': ['ari-tem:none'],
      'sun-second-ballot': ['edda-rook:ballot-administration'],
      'sun-ballot-reflect': ['omri-cade:none'], 'sun-perseverance': ['judge:direction'],
      'sun-further-discussion': ['edda-rook:none'],
      'sun-fresh-unanimity-ballot': ['edda-rook:ballot-administration'],
      'sun-majority-direction': ['judge:direction'], 'sun-majority-limit': ['kessa-noor:none'],
      'sun-final-review': ['edda-rook:none'],
      'sun-final-ballot': ['edda-rook:ballot-administration'],
      'sun-analysis-close': ['narrator:narration'],
    })
    for (const candidate of SUNDAY_RETURN_CANDIDATES) {
      expect(candidate.turns.map(({ actorId, legalAction }) => actorId + ':' + legalAction))
        .toEqual(['narrator:narration', 'clerk:verdict-question', 'edda-rook:verdict-return', 'judge:ruling'])
    }
    expect(SUNDAY_ANALYSIS_CANDIDATES.flatMap(({ turns }) => turns)
      .every(({ actorId, legalAction }) => actorId === 'narrator' && legalAction === 'narration')).toBe(true)
  })

  it('locks every unanimous, divided and majority-capable ballot branch', () => {
    expect(SUNDAY_PROCEDURE_CANDIDATE.map(({ id }) => id)).toEqual([
      'sun-resume-1', 'sun-resume-2', 'sun-negligence-1', 'sun-negligence-2',
      'sun-second-ballot', 'sun-ballot-reflect', 'sun-perseverance',
      'sun-further-discussion', 'sun-fresh-unanimity-ballot',
      'sun-majority-direction', 'sun-majority-limit', 'sun-final-review',
      'sun-final-ballot', 'sun-analysis-close',
    ])
    expect(SUNDAY_BALLOT_BRANCHES).toEqual({
      secondBallotUnanimous: ['sun-second-ballot', 'open-court-return'],
      freshBallotUnanimous: [
        'sun-second-ballot', 'sun-perseverance', 'sun-further-discussion',
        'sun-fresh-unanimity-ballot', 'open-court-return',
      ],
      freshBallotDividedAfterLegalTiming: [
        'sun-second-ballot', 'sun-perseverance', 'sun-further-discussion',
        'sun-fresh-unanimity-ballot', 'sun-majority-direction',
        'sun-final-ballot', 'open-court-return',
      ],
    })
    expect(procedureById('sun-second-ballot').guard).toBe('always')
    for (const id of ['sun-perseverance', 'sun-further-discussion', 'sun-fresh-unanimity-ballot']) {
      expect(procedureById(id).guard).toBe('second-ballot-divided')
    }
    for (const id of ['sun-majority-direction', 'sun-majority-limit', 'sun-final-review', 'sun-final-ballot']) {
      expect(procedureById(id).guard).toBe('fresh-ballot-divided-and-legal-timing-satisfied')
    }
    expect(procedureById('sun-fresh-unanimity-ballot').sourceText)
      .toMatch(/fresh private ballot seeking unanimity.*earlier ballot is not reused.*all twelve.*If divided/is)
    expect(procedureById('sun-majority-direction').sourceText)
      .toMatch(/more than eight hours.*second private ballot.*perseverance direction.*further deliberation.*fresh private unanimity ballot.*also did not produce unanimity.*eleven-to-one/is)
    expect(procedureById('sun-final-ballot').sourceText)
      .toMatch(/final position in private.*all twelve agree.*eleven agree.*no lawful agreement/is)
    expect(elevenMinutesDeliberation.majorityGate.minimumElapsedCourtHours).toBeGreaterThan(8)
  })

  it('enumerates exactly six substantive returns and the hung return', () => {
    const branchKeys = SUNDAY_RETURN_CANDIDATES.map(({ verdict, agreement }) => verdict + ':' + agreement)
    expect(branchKeys).toEqual([
      'murder:unanimous', 'murder:majority',
      'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority',
      'unable-to-agree:hung',
    ])
    for (const candidate of SUNDAY_RETURN_CANDIDATES) {
      const activeTurns = openCourtReturnTurns(candidate.verdict, candidate.agreement)
      expect(candidate.turns.map(({ displayLabel, text }) => ({ speaker: displayLabel, text })), candidate.id)
        .toEqual(activeTurns.map(({ speaker, text }) => ({
          speaker: speaker === 'Clerk' ? 'Judge’s Associate' : speaker, text,
        })))
    }
  })

  it('moves all four complete analyses to Narrator-owned reviewed data', () => {
    expect(SUNDAY_ANALYSIS_CANDIDATES.map((candidate) => ({
      verdict: candidate.verdict,
      threshold: candidate.threshold,
      lawfulRationale: candidate.lawfulRationale,
      counterAnalysis: candidate.counterAnalysis,
    }))).toEqual(elevenMinutesDeliberation.outcomePaths)
    expect(SUNDAY_ANALYSIS_CANDIDATES.map(({ verdict }) => verdict))
      .toEqual(['murder', 'manslaughter', 'not-guilty', 'unable-to-agree'])
    expect(SUNDAY_ANALYSIS_CANDIDATES.every(({ sourceText }) =>
      /Strongest lawful rationale:.*Strongest counter-analysis:/s.test(sourceText))).toBe(true)
    expect(SUNDAY_ANALYSIS_CANDIDATES.map(({ sourceText }) => sourceText).join(' '))
      .not.toMatch(/correct answer|Judge['’]s neutral case note/i)
    expect(COURT_WEEK_ACTORS.map(({ id }) => id as string)).not.toContain('neutral-case-note')
  })

  it('requires exact, unambiguous provenance across every static and dynamic outcome turn', () => {
    const dynamicCandidates = [...SUNDAY_RETURN_CANDIDATES, ...SUNDAY_ANALYSIS_CANDIDATES]
    expect(dynamicCandidates).toHaveLength(11)
    expect(allCandidates.slice(-dynamicCandidates.length)).toEqual(dynamicCandidates)
    for (const turn of allCandidates.flatMap(({ turns }) => turns)) {
      const literalQuotes = [...turn.text.matchAll(/“[^”]+”/gu)].map(([text]) => text)
      const reviewedQuotes = (turn.quotedSpans ?? [])
        .map((span) => turn.text.slice(span.start, span.end))
      expect(reviewedQuotes, turn.id).toEqual(literalQuotes)
      for (const quote of reviewedQuotes) {
        expect(turn.text.indexOf(quote), `${turn.id}: ${quote}`).toBe(turn.text.lastIndexOf(quote))
      }
    }
  })
})
