import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { deriveEvidenceLedger, evidenceState } from './evidenceLedger'

const { trial } = elevenMinutesCourtWeek
const sessions = elevenMinutesCourtWeek.manifest.sessions
const at = (cueId: string, authoredCueComplete = false) => deriveEvidenceLedger(
  trial, sessions, { cueId, authoredCueComplete },
)

describe('point-in-time evidence admission ledger', () => {
  it('keeps the route diagram unavailable until its admission cue finishes', () => {
    expect(evidenceState(at('mon-orr-chief-1'), 'ex-route')).toBe('unavailable')
    expect(evidenceState(at('mon-orr-chief-2'), 'ex-route')).toBe('unavailable')
    expect(evidenceState(at('mon-orr-chief-2', true), 'ex-route')).toBe('admitted')
  })

  it('preserves the recording warning from provisional admission until final admission', () => {
    const provisional = at('tue-recording-foundation', true)
    expect(evidenceState(provisional, 'ex-distress')).toBe('provisional')
    expect(provisional.find(({ evidence }) => evidence.id === 'ex-distress')?.effectiveTransition)
      .toMatchObject({ cueId: 'tue-recording-foundation', basis: 'provisional-admission' })
    const afterPlayback = at('tue-recording-play', true)
    expect(evidenceState(afterPlayback, 'ex-distress')).toBe('provisional')
    expect(afterPlayback.find(({ evidence }) => evidence.id === 'ex-distress')?.effectiveTransition)
      .toMatchObject({ cueId: 'tue-recording-foundation', basis: 'provisional-admission' })
    expect(evidenceState(at('tue-recording-final-admission'), 'ex-distress')).toBe('provisional')
    expect(evidenceState(at('tue-recording-final-admission', true), 'ex-distress')).toBe('admitted')
  })

  it('does not expose the READY snapshot from earlier testimony or pack membership', () => {
    expect(evidenceState(at('tue-mir-chief-3', true), 'ex-ready-display')).toBe('unavailable')
    expect(evidenceState(at('wed-ready-admitted'), 'ex-ready-display')).toBe('unavailable')
    expect(evidenceState(at('wed-ready-admitted', true), 'ex-ready-display')).toBe('admitted')
  })

  it('admits the oral expert opinion only after its evidence is given', () => {
    expect(evidenceState(at('wed-vos-chief-1'), 'ex-survival')).toBe('unavailable')
    expect(evidenceState(at('wed-vos-chief-1', true), 'ex-survival')).toBe('admitted')
    expect(at('wed-vos-cross-1', true).find(({ evidence }) => evidence.id === 'ex-survival')?.effectiveTransition)
      .toMatchObject({ cueId: 'wed-vos-chief-1', basis: 'oral-expert-evidence' })
  })

  it('marks excluded oral material struck only when the ruling is complete', () => {
    expect(evidenceState(at('wed-blurt', true), 'struck-rumour')).toBe('unavailable')
    expect(evidenceState(at('wed-postanswer-ruling'), 'struck-rumour')).toBe('unavailable')
    expect(evidenceState(at('wed-postanswer-ruling', true), 'struck-rumour')).toBe('struck')
  })

  it('accepts paced child ids and fails closed for an unknown cursor', () => {
    expect(evidenceState(at('mon-orr-chief-2--caption-2'), 'ex-route')).toBe('unavailable')
    expect(() => at('mon-orr-chief-2--caption-2', true)).toThrow(/partial caption cue/i)
    expect(() => at('missing-cue')).toThrow(/unknown cue/i)
  })
})
