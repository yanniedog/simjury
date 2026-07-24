import { describe, expect, it } from 'vitest'
import { docketCaseSchema } from './caseSchema'
import { makeDocketCase, makeJuror } from './fixtures'

describe('docketCaseSchema', () => {
  it('accepts a well-formed docket case', () => {
    expect(docketCaseSchema.safeParse(makeDocketCase()).success).toBe(true)
  })

  it('pins label to fiction', () => {
    const c = { ...makeDocketCase(), label: 'real' }
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects a dd id that does not match the grammar', () => {
    const c = makeDocketCase({ id: 'd-0001' as never })
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('accepts leap day and rejects impossible calendar dates', () => {
    expect(
      docketCaseSchema.safeParse(makeDocketCase({ publish_date: '2028-02-29' }))
        .success,
    ).toBe(true)

    for (const publish_date of [
      '2026-02-29',
      '2026-04-31',
      '2026-00-10',
      '2026-13-01',
      '2026-01-00',
    ]) {
      expect(
        docketCaseSchema.safeParse(makeDocketCase({ publish_date })).success,
      ).toBe(false)
    }
  })

  it('rejects fewer than 6 beats', () => {
    const c = makeDocketCase()
    c.beats = c.beats.slice(0, 5)
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects a jury that is not exactly 11', () => {
    const c = makeDocketCase()
    c.jury = { jurors: c.jury.jurors.slice(0, 10) }
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects an unknown beat tag', () => {
    const c = makeDocketCase()
    c.beats[0] = { ...c.beats[0], tags: ['vibes' as never] }
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects a juror with out-of-range rule deltas', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[0].effect.delta = 3
    c.jury.jurors[0] = j
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects a duplicate cast id', () => {
    const c = makeDocketCase()
    c.cast = [...c.cast, { ...c.cast[0] }]
    const result = docketCaseSchema.safeParse(c)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate cast id'))).toBe(true)
    }
  })

  it('allows empty check-ins (progressive conviction removed)', () => {
    const c = makeDocketCase({ checkins: [] })
    expect(docketCaseSchema.safeParse(c).success).toBe(true)
  })

  it('accepts the guided intro id', () => {
    const c = makeDocketCase({ id: 'dd-intro', checkins: [] })
    expect(docketCaseSchema.safeParse(c).success).toBe(true)
  })

  it('requires the engagement layer: hook, accused, statements, epilogue', () => {
    for (const field of ['hook', 'accused', 'statements', 'epilogue']) {
      const c: Record<string, unknown> = { ...makeDocketCase() }
      delete c[field]
      expect(docketCaseSchema.safeParse(c).success).toBe(false)
    }
  })

  it('rejects a duplicate beat id', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b, i) => (i === 3 ? { ...b, id: c.beats[0].id } : b))
    const result = docketCaseSchema.safeParse(c)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duplicate beat id'))).toBe(true)
    }
  })

  it('accepts weekly media and rejects media for an unknown beat', () => {
    const asset = {
      src: '/today/media/dd-0001/scene.webp',
      alt: 'A fictional courtroom scene.',
      caption: 'Fictional court sketch of the hearing.',
      kind: 'court_sketch' as const,
    }
    const c = makeDocketCase()
    c.media = { cover: asset, accused: asset, beats: { b1: asset } }
    expect(docketCaseSchema.safeParse(c).success).toBe(true)
    c.media.beats.missing = asset
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('rejects media without an explicit fictional label', () => {
    const asset = {
      src: '/today/media/dd-0001/scene.webp',
      alt: 'A fictional courtroom scene.',
      caption: 'Court sketch',
      kind: 'court_sketch' as const,
    }
    const c = makeDocketCase()
    c.media = { cover: asset, accused: asset, beats: {} }
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })

  it('supports structured multi-speaker courtroom dialogue', () => {
    const c = makeDocketCase()
    c.beats[1].turns = [
      { speaker: 'defc', text: 'Question from counsel.' },
      { speaker: 'w1', text: 'Answer from the witness.' },
    ]
    expect(docketCaseSchema.safeParse(c).success).toBe(true)
    c.beats[1].turns = c.beats[1].turns.slice(0, 1)
    expect(docketCaseSchema.safeParse(c).success).toBe(false)
  })
})
