import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { elevenMinutesSessions } from './sessions'
import {
  assertCourtWeekSpeechCandidates,
  buildCourtWeekSpeechReviewLedger,
  COURT_WEEK_SPEECH_CANDIDATES,
  type LedgerCandidateCue,
  type SpeechCandidateDay,
} from './speechReviewLedger'

const EXPECTED_LEDGER_SHA256 = '471fbb78881dee3e92dae8b2a6203712423b42596746f6b99d4f9886955eb171'

function digest(
  days: readonly SpeechCandidateDay[] = COURT_WEEK_SPEECH_CANDIDATES, sessions = elevenMinutesSessions,
): string {
  return createHash('sha256').update(JSON.stringify(buildCourtWeekSpeechReviewLedger(days, sessions))).digest('hex')
}

function mutateCue(id: string, transform: (cue: LedgerCandidateCue) => LedgerCandidateCue): SpeechCandidateDay[] {
  let matches = 0
  const rewrite = (cues: readonly LedgerCandidateCue[]) => cues.map((cue) => {
    if (cue.id !== id) return cue
    matches += 1
    return transform(cue)
  })
  const days = COURT_WEEK_SPEECH_CANDIDATES.map((day) => ({
    ...day, primary: rewrite(day.primary), variants: rewrite(day.variants),
  }))
  if (matches !== 1) throw new Error(id + ': mutation fixture must identify exactly one cue')
  return days
}

describe('Court Week exhaustive speech-review ledger', () => {
  it('pins every source, candidate, runtime variant, turn, word and quotation', () => {
    const ledger = buildCourtWeekSpeechReviewLedger()
    expect(ledger.schema).toBe('simjury.court-week-speech-review/v1')
    expect(ledger.rows).toHaveLength(354)
    expect(new Set(ledger.rows.map(({ cueId }) => cueId)).size).toBe(137)
    expect(new Set(ledger.rows.flatMap(({ sourceCueIds }) => sourceCueIds)).size).toBe(127)
    expect(new Set(ledger.rows.flatMap(({ captionProjection }) =>
      captionProjection.map(({ id }) => id))).size).toBe(303)
    expect(ledger.rows.flatMap(({ quotes }) => quotes)).toHaveLength(19)
    expect(Object.fromEntries(COURT_WEEK_SPEECH_CANDIDATES.map((day) => {
      const rows = ledger.rows.filter((row) => row.day === day.day)
      return [day.day, [new Set(rows.map(({ cueId }) => cueId)).size, rows.length]]
    }))).toEqual({
      monday: [18, 41], tuesday: [20, 87], wednesday: [19, 86],
      thursday: [17, 44], friday: [19, 22], saturday: [19, 24], sunday: [25, 50],
    })
    expect(digest()).toBe(EXPECTED_LEDGER_SHA256)
  })

  it('pins the complete Sunday return paths after the fresh-unanimity gate', () => {
    expect(buildCourtWeekSpeechReviewLedger().branches).toEqual({
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
    const sunday = COURT_WEEK_SPEECH_CANDIDATES.at(-1)!
    expect(sunday.variantKeys).toEqual([
      'murder:unanimous', 'murder:majority', 'manslaughter:unanimous', 'manslaughter:majority',
      'not-guilty:unanimous', 'not-guilty:majority', 'unable-to-agree:hung',
      'analysis:murder', 'analysis:manslaughter', 'analysis:not-guilty', 'analysis:unable-to-agree',
    ])
  })

  it('pins both Monday juror-promise branches and their private response actions', () => {
    const monday = COURT_WEEK_SPEECH_CANDIDATES[0]!
    expect(monday.variantKeys).toEqual(['juror-promise:oath', 'juror-promise:affirmation'])
    const rows = buildCourtWeekSpeechReviewLedger().rows.filter(({ day, variant }) =>
      day === 'monday' && variant !== null)
    expect(rows.map(({ actorId, legalAction, variant, jurorAction }) => ({
      actorId, legalAction, variant, jurorAction,
    }))).toEqual([
      {
        actorId: 'court-officer', legalAction: 'oath-administered',
        variant: 'juror-promise:oath', jurorAction: 'I swear',
      },
      {
        actorId: 'court-officer', legalAction: 'oath-administered',
        variant: 'juror-promise:affirmation', jurorAction: 'I affirm',
      },
    ])
  })

  it('rejects missing, stale and incomplete runtime rows', () => {
    const missing = COURT_WEEK_SPEECH_CANDIDATES.map((day) => day.day === 'monday'
      ? { ...day, primary: day.primary.slice(1) } : day)
    expect(() => assertCourtWeekSpeechCandidates(missing)).toThrow(/missing, stale, duplicated or reordered/i)
    const stale = mutateCue('mon-arrival-1', (cue) => ({ ...cue, sourceCueId: 'mon-stale' }))
    expect(() => assertCourtWeekSpeechCandidates(stale)).toThrow(/missing, stale, duplicated or reordered|stale source/i)
    const missingBranch = COURT_WEEK_SPEECH_CANDIDATES.map((day) => day.day === 'sunday'
      ? { ...day, variants: day.variants.slice(1) } : day)
    expect(() => assertCourtWeekSpeechCandidates(missingBranch)).toThrow(/runtime branches/i)
    const missingMondayBranch = COURT_WEEK_SPEECH_CANDIDATES.map((day) => day.day === 'monday'
      ? { ...day, variants: day.variants.slice(1) } : day)
    expect(() => assertCourtWeekSpeechCandidates(missingMondayBranch)).toThrow(/runtime branches|review order/i)
  })

  it('rejects caption/source disagreement while preserving the intentional active Monday order mismatch', () => {
    const sessions = elevenMinutesSessions.map((session) => ({
      ...session,
      scenes: session.scenes.map((scene) => ({
        ...scene,
        cues: scene.cues.map((cue) => cue.id === 'mon-arrival-1--caption-2'
          ? { ...cue, id: 'mon-arrival-1--caption-99' } : cue),
      })),
    }))
    expect(() => assertCourtWeekSpeechCandidates(COURT_WEEK_SPEECH_CANDIDATES, sessions))
      .toThrow(/caption ids/i)
    expect(() => assertCourtWeekSpeechCandidates()).not.toThrow()
    const projectionDrift = elevenMinutesSessions.map((session) => ({
      ...session,
      scenes: session.scenes.map((scene) => ({
        ...scene,
        cues: scene.cues.map((cue) => cue.id === 'mon-arrival-1--caption-2'
          ? { ...cue, speaker: 'Judge Sel Aven' } : cue),
      })),
    }))
    expect(digest(COURT_WEEK_SPEECH_CANDIDATES, projectionDrift))
      .not.toBe(EXPECTED_LEDGER_SHA256)
  })

  it.each([
    'The accused answers: Not guilty.',
    'Sola Iven answers that the beacon matters.',
    'Kessa answers immediately that the warning matters.',
    'Another voice asks whether READY proves safety.',
    'Someone says that silence proves guilt.',
    'Edda writes: We remain divided.',
    'Qill: The warning permitted launch.',
  ])('rejects a current hidden-attribution fixture: %s', (hiddenSpeech) => {
    const days = mutateCue('mon-arrival-1', (cue) => {
      const first = cue.turns[0]!
      const text = first.text + ' ' + hiddenSpeech
      const turns = [{ ...first, text }, ...cue.turns.slice(1)]
      return { ...cue, sourceText: turns.map((turn) => turn.text).join(' '), turns }
    })
    expect(() => assertCourtWeekSpeechCandidates(days))
      .toThrow(/attributed speech|attributed speaker/i)
  })

  it('rejects unknown display aliases, candidate prefixes and turn prefixes', () => {
    const alias = mutateCue('mon-arrival-1', (cue) => ({
      ...cue, turns: [{ ...cue.turns[0]!, displayLabel: 'Unknown officer' }, ...cue.turns.slice(1)],
    }))
    expect(() => assertCourtWeekSpeechCandidates(alias)).toThrow(/display label/i)
    const candidatePrefix = mutateCue('mon-arrival-1', (cue) => ({ ...cue, id: 'bad-arrival' }))
    expect(() => assertCourtWeekSpeechCandidates(candidatePrefix)).toThrow(/review order|unknown candidate prefix/i)
    const turnPrefix = mutateCue('mon-arrival-1', (cue) => ({
      ...cue, turns: [{ ...cue.turns[0]!, id: 'mon-wrong__1' }, ...cue.turns.slice(1)],
    }))
    expect(() => assertCourtWeekSpeechCandidates(turnPrefix)).toThrow(/unknown turn prefix/i)
  })

  it('requires current reviewed officer labels while retaining stable actor ids', () => {
    const rows = buildCourtWeekSpeechReviewLedger().rows
    expect(new Set(rows.filter(({ actorId }) => actorId === 'clerk').map(({ displayLabel }) => displayLabel)))
      .toEqual(new Set(['Judge’s Associate']))
    expect(new Set(rows.filter(({ actorId }) => actorId === 'court-officer').map(({ displayLabel }) => displayLabel)))
      .toEqual(new Set(['Court Attendant']))
  })

  it('rejects actor/action violations and incomplete exact quote provenance', () => {
    const authority = mutateCue('mon-plea', (cue) => ({
      ...cue,
      turns: cue.turns.map((turn) => turn.legalAction === 'plea-answer'
        ? { ...turn, actorId: 'clerk', displayLabel: 'Clerk' } : turn),
    }))
    expect(() => assertCourtWeekSpeechCandidates(authority)).toThrow(/cannot perform plea-answer/i)
    const oathAuthority = mutateCue('mon-oath-oath', (cue) => ({
      ...cue,
      turns: cue.turns.map((turn) => ({ ...turn, actorId: 'judge', displayLabel: 'Judge Sel Aven' })),
    }))
    expect(() => assertCourtWeekSpeechCandidates(oathAuthority)).toThrow(/cannot perform oath-administered/i)
    const quoted = COURT_WEEK_SPEECH_CANDIDATES.flatMap((day) => [...day.primary, ...day.variants])
      .find((cue) => cue.turns.some((turn) => turn.quotedSpans?.length))!
    const provenance = mutateCue(quoted.id, (cue) => ({
      ...cue,
      turns: cue.turns.map((turn) => turn.quotedSpans?.length
        ? { ...turn, quotedSpans: undefined } : turn),
    }))
    expect(() => assertCourtWeekSpeechCandidates(provenance)).toThrow(/quotation provenance/i)
  })

  it.each([
    ['dropped', (text: string) => text.replace(/^\S+\s/u, '')],
    ['duplicated', (text: string) => text.split(' ')[0] + ' ' + text],
  ])('rejects %s turn words', (_label, change) => {
    const days = mutateCue('mon-arrival-1', (cue) => ({
      ...cue, turns: [{ ...cue.turns[0]!, text: change(cue.turns[0]!.text) }],
    }))
    expect(() => assertCourtWeekSpeechCandidates(days)).toThrow(/dropped, duplicated or reordered/i)
  })

  it('rejects reordered turns and fingerprints jointly edited source/turn text', () => {
    const reordered = mutateCue('mon-plea', (cue) => ({ ...cue, turns: [...cue.turns].reverse() }))
    expect(() => assertCourtWeekSpeechCandidates(reordered)).toThrow(/dropped, duplicated or reordered/i)
    const jointlyEdited = mutateCue('mon-arrival-1', (cue) => {
      const first = cue.turns[0]!
      const text = first.text.replace('Eleven Minutes', 'This exercise')
      const turns = [{ ...first, text }, ...cue.turns.slice(1)]
      return { ...cue, sourceText: turns.map((turn) => turn.text).join(' '), turns }
    })
    expect(() => assertCourtWeekSpeechCandidates(jointlyEdited)).not.toThrow()
    expect(digest(jointlyEdited)).not.toBe(EXPECTED_LEDGER_SHA256)
  })
})
