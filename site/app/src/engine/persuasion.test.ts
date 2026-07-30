import { describe, expect, it } from 'vitest'
import type { Juror } from '../lib/v2/caseSchema'
import { jurorProfile } from './jurorProfile'
import {
  applyAppeal,
  roomReadout,
  scoreAppeal,
  startPersuasion,
} from './persuasion'

const holdout = jurorProfile({
  id: 'J-03',
  seat: 4,
  label: 'Juror 4 — Cora',
  persona: 'Keeps returning the room to disputed identity.',
  register: 'formal',
  arc: 'principled_holdout',
  weights: { identity: 2, procedure: 1, motive: -1 },
  initial: { position: 'NG', confidence: 80 },
} as Juror)

const vibes = jurorProfile({
  id: 'J-01',
  seat: 2,
  label: 'Juror 2 — Anya',
  persona: 'Starts with the vivid lobby image.',
  register: 'plain',
  arc: 'vibes',
  weights: { identity: 1, timeline: 2 },
  initial: { position: 'U', confidence: 40 },
} as Juror)

describe('persuasion', () => {
  it('scores the same appeal identically across runs', () => {
    const state = startPersuasion([holdout.id])
    const appeal = {
      move: 'assert' as const,
      beatId: 'b1',
      beatTags: ['identity' as const],
      targetJurorId: holdout.id,
    }
    const a = scoreAppeal(holdout, state.byJuror[holdout.id], appeal)
    const b = scoreAppeal(holdout, state.byJuror[holdout.id], appeal)
    expect(a).toEqual(b)
    expect(a.tell.length).toBeGreaterThan(0)
    expect(['open', 'listening', 'guarded', 'resistant', 'shut']).toContain(
      a.reception,
    )
  })

  it('never leaks leanings in the room readout', () => {
    const state = startPersuasion([holdout.id, vibes.id])
    const receptions = applyAppeal(state, [holdout, vibes], {
      move: 'ask_reason',
      beatId: 'b2',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    const text = roomReadout(receptions)
    expect(text.toLowerCase()).not.toMatch(/\b(guilt|innocent|not guilty|tally|vote)\b/)
    expect(text.length).toBeGreaterThan(0)
  })

  it('restores patience on invitation and spends it on ordinary appeals', () => {
    const state = startPersuasion([holdout.id])
    applyAppeal(state, [holdout], {
      move: 'assert',
      beatId: 'b-spend',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    const afterSpend = state.byJuror[holdout.id].patience
    expect(afterSpend).toBeLessThan(100)

    applyAppeal(state, [holdout], {
      move: 'ask_reason',
      beatId: 'b-invite',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    expect(state.byJuror[holdout.id].patience).toBeGreaterThan(afterSpend)
  })

  it('includes guarded jurors in the room readout', () => {
    const text = roomReadout([
      {
        jurorId: 'a',
        reception: 'guarded',
        multiplier: 0.9,
        rapport: 0,
        rapportDelta: 0,
        tell: 'listens, but is not moving yet',
        ownSubject: false,
        discounts: false,
        backfired: false,
      },
      {
        jurorId: 'b',
        reception: 'listening',
        multiplier: 1.1,
        rapport: 0,
        rapportDelta: 0,
        tell: 'leans in a little',
        ownSubject: false,
        discounts: false,
        backfired: false,
      },
    ])
    expect(text).toContain('not moving yet')
    expect(text).toContain('stayed with it')
    expect(text).not.toBe('The room heard it and moved on.')
  })

  it('honors supportBeatId on connect_evidence without a bare supportResolved flag', () => {
    const state = startPersuasion([holdout.id])
    const base = {
      move: 'connect_evidence' as const,
      beatId: 'b-main',
      beatTags: ['identity' as const],
      targetJurorId: holdout.id,
    }
    const without = scoreAppeal(holdout, state.byJuror[holdout.id], base)
    const withBeat = scoreAppeal(holdout, state.byJuror[holdout.id], {
      ...base,
      supportBeatId: 'b-support',
    })
    const flagAlone = scoreAppeal(
      holdout,
      state.byJuror[holdout.id],
      base,
      { supportResolved: true },
    )
    expect(withBeat.multiplier).toBeGreaterThan(without.multiplier)
    expect(flagAlone.multiplier).toBe(without.multiplier)
  })

  it('does not treat an invitation as a heard repeat of its answer beat', () => {
    const state = startPersuasion([holdout.id])
    applyAppeal(state, [holdout], {
      move: 'ask_reason',
      beatId: 'b-answer',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    expect(state.byJuror[holdout.id].heard).toEqual([])

    const answer = scoreAppeal(holdout, state.byJuror[holdout.id], {
      move: 'assert',
      beatId: 'b-answer',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    const fresh = scoreAppeal(
      holdout,
      { rapport: state.byJuror[holdout.id].rapport, patience: 100, pressed: 0, heard: [] },
      {
        move: 'assert',
        beatId: 'b-answer',
        beatTags: ['identity'],
        targetJurorId: holdout.id,
      },
    )
    expect(answer.multiplier).toBe(fresh.multiplier)
  })

  it('limits invitation open reactions to the addressed juror', () => {
    const state = startPersuasion([holdout.id, vibes.id])
    const receptions = applyAppeal(state, [holdout, vibes], {
      move: 'ask_reason',
      beatId: 'b-ask',
      beatTags: ['identity'],
      targetJurorId: holdout.id,
    })
    const byId = Object.fromEntries(receptions.map((r) => [r.jurorId, r]))
    expect(byId[holdout.id].reception).toBe('open')
    expect(byId[vibes.id].reception).toBe('listening')
    expect(byId[vibes.id].rapportDelta).toBe(0)
    expect(roomReadout(receptions)).not.toMatch(/2 jurors turned toward you/)
  })
})
