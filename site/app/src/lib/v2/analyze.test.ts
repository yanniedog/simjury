import { describe, expect, it } from 'vitest'
import { analyzeDocketPlay } from './analyze'
import { makeDocketCase } from './fixtures'

// The factory case: checkins at b3, b6, b9; trap b1 (guilt) sits in the first
// segment; decisive innocence beats b4/b7 in the second and third.

describe('analyzeDocketPlay', () => {
  it('scores a play that resisted the trap and read the case right', () => {
    // 50 -> 40 across the trap segment (moved toward innocence), stays low.
    const a = analyzeDocketPlay(makeDocketCase(), [40, 25, 20], 'Not Guilty')
    expect(a.correct).toBe(true)
    expect(a.totalTraps).toBe(1)
    expect(a.trapsSwayed).toBe(0)
    expect(a.segments).toHaveLength(4) // three check-ins + the trailing tail
    expect(a.segments[3].checkinId).toBeNull()
  })

  it('catches the juror the trap pulled', () => {
    // 50 -> 75 across the segment containing the guilt trap.
    const a = analyzeDocketPlay(makeDocketCase(), [75, 60, 55], 'Guilty')
    expect(a.correct).toBe(false)
    expect(a.trapsSwayed).toBe(1)
    const trapReveal = a.reveals.find((r) => r.beat.id === 'b1')!
    expect(trapReveal.tookBait).toBe(true)
  })

  it('chains segment boundaries: each check-in becomes the next before', () => {
    const a = analyzeDocketPlay(makeDocketCase(), [70, 30, 45], 'Not Guilty')
    expect(a.segments[0]).toMatchObject({ before: 50, after: 70 })
    expect(a.segments[1]).toMatchObject({ before: 70, after: 30 })
    expect(a.segments[2]).toMatchObject({ before: 30, after: 45 })
  })

  it('treats missing check-in values as no movement', () => {
    const a = analyzeDocketPlay(makeDocketCase(), [], 'Not Guilty')
    expect(a.trapsSwayed).toBe(0)
    for (const s of a.segments) expect(s.after).toBe(s.before)
  })

  it('beats after the last check-in can never be bait', () => {
    const c = makeDocketCase()
    // Make the final (post-check-in) beat a trap; there is no window to sway.
    c.beats[9] = {
      ...c.beats[9],
      reveal_stamp: 'misleading',
      surface_persuasion: 0.9,
      true_weight: 0.1,
    }
    const a = analyzeDocketPlay(c, [90, 90, 90], 'Guilty')
    expect(a.reveals.find((r) => r.beat.id === 'b10')!.tookBait).toBe(false)
  })
})
