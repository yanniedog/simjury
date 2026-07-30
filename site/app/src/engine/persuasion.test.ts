import { describe, expect, it } from 'vitest'
import type { Juror } from '../lib/v2/caseSchema'
import { jurorProfile } from './jurorProfile'
import { applyAppeal, roomReadout, scoreAppeal, startPersuasion } from './persuasion'

const holdout = jurorProfile({
  id: 'J-03', seat: 4, label: 'Juror 4 — Cora',
  persona: 'Keeps returning the room to disputed identity.',
  register: 'formal', arc: 'principled_holdout',
  weights: { identity: 2, procedure: 1, motive: -1 },
  initial: { position: 'NG', confidence: 80 },
} as Juror)

const vibes = jurorProfile({
  id: 'J-01', seat: 2, label: 'Juror 2 — Anya',
  persona: 'Starts with the vivid lobby image.',
  register: 'plain', arc: 'vibes',
  weights: { identity: 1, timeline: 2 },
  initial: { position: 'U', confidence: 40 },
} as Juror)

describe('persuasion', () => {
  it('is deterministic and never leaks leanings', () => {
    const state = startPersuasion([holdout.id, vibes.id])
    const appeal = {
      move: 'ask_reason' as const,
      beatId: 'b2',
      beatTags: ['identity' as const],
      targetJurorId: holdout.id,
    }
    expect(scoreAppeal(holdout, state.byJuror[holdout.id], appeal))
      .toEqual(scoreAppeal(holdout, state.byJuror[holdout.id], appeal))
    const text = roomReadout(applyAppeal(state, [holdout, vibes], appeal))
    expect(text.toLowerCase()).not.toMatch(/\b(guilt|innocent|not guilty|tally|vote)\b/)
  })

  it('restores patience on invitation after a spend', () => {
    const state = startPersuasion([holdout.id])
    applyAppeal(state, [holdout], {
      move: 'assert', beatId: 'b-spend', beatTags: ['identity'], targetJurorId: holdout.id,
    })
    const afterSpend = state.byJuror[holdout.id].patience
    applyAppeal(state, [holdout], {
      move: 'ask_reason', beatId: 'b-invite', beatTags: ['identity'], targetJurorId: holdout.id,
    })
    expect(state.byJuror[holdout.id].patience).toBeGreaterThan(afterSpend)
  })

  it('includes guarded jurors in the room readout', () => {
    expect(roomReadout([{
      jurorId: 'a', reception: 'guarded', multiplier: 0.9, rapport: 0, rapportDelta: 0,
      tell: 'x', ownSubject: false, discounts: false, backfired: false,
    }])).toContain('not moving yet')
  })

  it('honors supportBeatId and ignores bare supportResolved', () => {
    const state = startPersuasion([holdout.id])
    const base = {
      move: 'connect_evidence' as const, beatId: 'b-main',
      beatTags: ['identity' as const], targetJurorId: holdout.id,
    }
    const without = scoreAppeal(holdout, state.byJuror[holdout.id], base)
    expect(scoreAppeal(holdout, state.byJuror[holdout.id], { ...base, supportBeatId: 'b-s' }).multiplier)
      .toBeGreaterThan(without.multiplier)
    expect(scoreAppeal(holdout, state.byJuror[holdout.id], base, { supportResolved: true }).multiplier)
      .toBe(without.multiplier)
  })

  it('does not let invitations consume the answer beat repeat budget', () => {
    const state = startPersuasion([holdout.id])
    applyAppeal(state, [holdout], {
      move: 'ask_reason', beatId: 'b-answer', beatTags: ['identity'], targetJurorId: holdout.id,
    })
    expect(state.byJuror[holdout.id].heard).toEqual([])
    const answer = scoreAppeal(holdout, state.byJuror[holdout.id], {
      move: 'assert', beatId: 'b-answer', beatTags: ['identity'], targetJurorId: holdout.id,
    })
    const fresh = scoreAppeal(
      holdout,
      { rapport: state.byJuror[holdout.id].rapport, patience: 100, pressed: 0, heard: [] },
      { move: 'assert', beatId: 'b-answer', beatTags: ['identity'], targetJurorId: holdout.id },
    )
    expect(answer.multiplier).toBe(fresh.multiplier)
  })

  it('limits invitation open reactions to the addressee', () => {
    const state = startPersuasion([holdout.id, vibes.id])
    const byId = Object.fromEntries(applyAppeal(state, [holdout, vibes], {
      move: 'ask_reason', beatId: 'b-ask', beatTags: ['identity'], targetJurorId: holdout.id,
    }).map((r) => [r.jurorId, r]))
    expect(byId[holdout.id].reception).toBe('open')
    expect(byId[vibes.id].reception).toBe('listening')
    expect(byId[vibes.id].rapportDelta).toBe(0)
  })
})
