import { describe, expect, it } from 'vitest'
import { makeDocketCase, makeV3DocketCase } from './fixtures'
import { jurorSeats, splitJurorLabel, SEAT_STYLE_MARK } from './jurorSeats'

describe('splitJurorLabel', () => {
  it('separates the given name the transcript uses from the authored role', () => {
    expect(splitJurorLabel('Vela · foreperson')).toEqual({
      name: 'Vela',
      role: 'foreperson',
    })
  })

  it('leaves a plain name without a role', () => {
    expect(splitJurorLabel('Yara')).toEqual({ name: 'Yara', role: null })
  })

  /**
   * Four of the ten live cases — including the guided intro every new player
   * meets — author labels as "Juror 2 — Anya". Left whole, the bench printed a
   * number and a name, and the seat's caption already carries the number, so
   * it said it twice and put a number back on the bench.
   */
  it('drops a Juror-number prefix and keeps the given name', () => {
    expect(splitJurorLabel('Juror 2 — Anya')).toEqual({ name: 'Anya', role: null })
    expect(splitJurorLabel('Juror 11 – Cora')).toEqual({ name: 'Cora', role: null })
    expect(splitJurorLabel('Juror 3 - Bram')).toEqual({ name: 'Bram', role: null })
  })

  it('handles a numbered label that also carries a role', () => {
    expect(splitJurorLabel('Juror 5 — Vela · foreperson')).toEqual({
      name: 'Vela',
      role: 'foreperson',
    })
  })

  it('keeps a dash that belongs to the name itself', () => {
    expect(splitJurorLabel('Anne-Marie')).toEqual({ name: 'Anne-Marie', role: null })
    expect(splitJurorLabel('Juror 4 — Anne-Marie')).toEqual({
      name: 'Anne-Marie',
      role: null,
    })
  })

  it('never returns an empty name', () => {
    expect(splitJurorLabel('Juror 7 —').name).not.toBe('')
  })
})

describe('jurorSeats', () => {
  const trial = makeDocketCase()

  it('gives every juror a name and a persuasion style, in seat order', () => {
    const seats = jurorSeats(trial)

    expect(seats).toHaveLength(trial.jury.jurors.length)
    expect(seats.map(({ seat }) => seat)).toEqual(
      [...seats.map(({ seat }) => seat)].sort((a, b) => a - b),
    )
    for (const seat of seats) {
      expect(seat.name).not.toBe('')
      expect(seat.styleLabel).toBe(SEAT_STYLE_MARK[seat.style].label)
      expect(seat.glyph).toBe(SEAT_STYLE_MARK[seat.style].glyph)
    }
  })

  /**
   * The product rule the bench must not break: a juror's leaning and the room's
   * tally stay sealed until the judge reads the result. Style and name describe
   * approach, not position, so a seat may carry them — but nothing derived from
   * `initial.position` may reach this view model at all.
   */
  it('carries no leaning, position or confidence', () => {
    const seats = jurorSeats(trial)
    const keys = new Set(seats.flatMap((seat) => Object.keys(seat)))

    for (const forbidden of ['position', 'lean', 'leaning', 'confidence', 'initial', 'vote']) {
      expect(keys).not.toContain(forbidden)
    }
    expect(JSON.stringify(seats)).not.toMatch(/"(G|NG|U)"/)
  })

  it('resolves an authored portrait through the shared base-URL rewrite', () => {
    const withPortrait = makeV3DocketCase()
    const first = withPortrait.jury.jurors[0]
    withPortrait.media!.portraits = {
      ...withPortrait.media?.portraits,
      [first.id]: {
        src: '/today/media/dd-0001/jurors/j1.webp',
        alt: 'Juror portrait',
        caption: 'Fictional character portrait of a juror.',
        kind: 'portrait',
      },
    }

    const seat = jurorSeats(withPortrait).find(({ id }) => id === first.id)!
    expect(seat.portrait?.src).toBe('/today/media/dd-0001/jurors/j1.webp')
  })

  it('leaves the portrait null when a case has not authored one', () => {
    const seats = jurorSeats(makeDocketCase())
    expect(seats.every(({ portrait }) => portrait === null)).toBe(true)
  })
})
