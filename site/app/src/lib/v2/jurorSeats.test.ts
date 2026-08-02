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
