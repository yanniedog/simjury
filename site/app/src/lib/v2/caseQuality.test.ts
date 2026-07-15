import { describe, expect, it } from 'vitest'
import { checkDocketCase, checkDocketQueue } from './caseQuality'
import { makeDocketCase, makeJuror, prose } from './fixtures'

describe('checkDocketCase', () => {
  it('passes a well-designed docket case', () => {
    expect(checkDocketCase(makeDocketCase())).toEqual([])
  })

  it('still runs the v1 puzzle-design core (missing trap)', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b) =>
      b.reveal_stamp === 'misleading' ? { ...b, reveal_stamp: 'minor' } : b,
    )
    expect(checkDocketCase(c).join()).toMatch(/misleading beat/)
  })

  it('flags a beat too short or too long for narration pacing', () => {
    const c = makeDocketCase()
    c.beats[1] = { ...c.beats[1], text: prose(10) }
    expect(checkDocketCase(c).join()).toMatch(/narration pacing/)
  })

  it('flags a case whose evidence blows the reading-phase budget', () => {
    const c = makeDocketCase()
    // 10 beats x 110 words = 1100 > the 1050-word budget (each beat also
    // trips the per-beat ceiling; this test greps the budget message).
    c.beats = c.beats.map((b) => ({ ...b, text: prose(110) }))
    expect(checkDocketCase(c).join()).toMatch(/reading phase/)
  })

  it('flags a speaker missing from the cast', () => {
    const c = makeDocketCase()
    c.beats[2] = { ...c.beats[2], speaker: 'ghost' }
    expect(checkDocketCase(c).join()).toMatch(/not in the cast/)
  })

  it('flags a direction not spoken by the court', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b) =>
      b.kind === 'direction' ? { ...b, speaker: 'w1' } : b,
    )
    expect(checkDocketCase(c).join()).toMatch(/spoken by the court/)
  })

  it('flags a witness beat without examination/cross', () => {
    const c = makeDocketCase()
    c.beats[0] = { ...c.beats[0], mode: undefined }
    expect(checkDocketCase(c).join()).toMatch(/examination or cross/)
  })

  it('flags a missing burden beat', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b) =>
      b.tags.includes('burden') ? { ...b, tags: ['procedure' as const] } : b,
    )
    expect(checkDocketCase(c).join()).toMatch(/burden/)
  })

  it('flags out-of-order and unresolved check-ins', () => {
    const c = makeDocketCase({ checkins: ['b6', 'b3', 'nope'] })
    const joined = checkDocketCase(c).join()
    expect(joined).toMatch(/out of beat order/)
    expect(joined).toMatch(/does not match any beat/)
  })

  it('flags an uncontested jury', () => {
    const c = makeDocketCase()
    c.jury.jurors = c.jury.jurors.map((j) => ({
      ...j,
      initial: { ...j.initial, position: 'G' as const },
    }))
    expect(checkDocketCase(c).join()).toMatch(/contested/)
  })

  it('flags a jury without the arcs that make a room move', () => {
    const c = makeDocketCase()
    c.jury.jurors = c.jury.jurors.map((j) =>
      j.arc === 'mind_changer' ? { ...j, arc: 'steady' as const } : j,
    )
    expect(checkDocketCase(c).join()).toMatch(/mind_changer/)
  })

  it('flags a juror whose default rule is not last', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules = [...j.reaction_rules].reverse()
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/default reaction rule/)
  })

  it('flags a rule that matches a theme no beat carries', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[0].when.theme = 'alibi'
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/unreachable/)
  })

  it('flags a direction-constrained rule no beat can ever satisfy', () => {
    const c = makeDocketCase()
    // Every digital_forensics beat in the fixture argues innocence, so a rule
    // pinned to stance 'proves' + direction 'guilt' on that theme can never
    // fire (proves always pushes the beat's own direction).
    const j = makeJuror(1, {
      reaction_rules: [
        {
          when: { theme: 'digital_forensics', stance: 'proves', direction: 'guilt' },
          effect: { delta: 1, confidence: 10, line: 'agree' },
        },
        {
          when: { theme: 'any', stance: 'any' },
          effect: { delta: 0, confidence: 0, line: 'pushback' },
        },
      ],
    })
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/unreachable/)
  })

  it('flags a rule that voices a line the juror does not have', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.reaction_rules[0].effect.line = 'holdout'
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/no such line/)
  })

  it('flags a juror below the authored-voice floor', () => {
    const c = makeDocketCase()
    const j = makeJuror(1)
    j.lines = { agree: ['ok'], pushback: ['no'], concede: ['fine'], final: ['done'] }
    c.jury.jurors[0] = j
    expect(checkDocketCase(c).join()).toMatch(/authored lines/)
  })

  it('flags a duplicate cast id (defense in depth beyond the schema check)', () => {
    const c = makeDocketCase()
    c.cast = [...c.cast, { ...c.cast[0] }]
    expect(checkDocketCase(c).join()).toMatch(/cast ids must be unique/)
  })

  it('flags a duplicate beat id (defense in depth beyond the schema check)', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b, i) => (i === 1 ? { ...b, id: c.beats[0].id } : b))
    expect(checkDocketCase(c).join()).toMatch(/beat ids must be unique/)
  })

  it('flags too few witnesses', () => {
    const c = makeDocketCase()
    // Collapse every witness beat onto a single speaker.
    c.beats = c.beats.map((b) =>
      b.kind === 'witness' ? { ...b, speaker: 'w1' } : b,
    )
    expect(checkDocketCase(c).join()).toMatch(/3-4 witnesses/)
  })

  it('flags when no rule actually voices burden_drift or burden_correct', () => {
    const c = makeDocketCase()
    c.jury.jurors = c.jury.jurors.map((j) => ({
      ...j,
      reaction_rules: j.reaction_rules.filter(
        (r) => r.effect.line !== 'burden_drift' && r.effect.line !== 'burden_correct',
      ),
    }))
    expect(checkDocketCase(c).join()).toMatch(/voices both burden_drift and burden_correct/)
  })

  it('flags a hook outside the cold-open budget', () => {
    const c = makeDocketCase({ hook: prose(8) })
    expect(checkDocketCase(c).join()).toMatch(/cold open/)
  })

  it('flags a statement outside the word budget', () => {
    const c = makeDocketCase()
    c.statements.opening.defence = { speaker: 'defc', text: prose(20) }
    expect(checkDocketCase(c).join()).toMatch(/opening\.defence has 20 words/)
  })

  it('flags a statement spoken by the wrong side or by nobody', () => {
    const c = makeDocketCase()
    c.statements.opening.prosecution = { speaker: 'defc', text: prose(60) }
    c.statements.closing.defence = { speaker: 'ghost', text: prose(60) }
    const joined = checkDocketCase(c).join()
    expect(joined).toMatch(/must be spoken by prosecution counsel/)
    expect(joined).toMatch(/closing\.defence speaker 'ghost' is not in the cast/)
  })

  it('flags a case whose narrated total blows the 8-10 minute loop', () => {
    const c = makeDocketCase()
    // 11 beats x 100 words + 4 x 90-word statements + the hook lands well
    // past the 1250-word narrated cap (the per-beat and evidence budgets trip
    // too; this test greps the narrated-cap message specifically).
    c.beats = c.beats.map((b) => ({ ...b, text: prose(100) }))
    for (const phase of ['opening', 'closing'] as const) {
      c.statements[phase].prosecution = { speaker: 'pros', text: prose(90) }
      c.statements[phase].defence = { speaker: 'defc', text: prose(90) }
    }
    expect(checkDocketCase(c).join()).toMatch(/narrated words/)
  })

  it('flags an epilogue outside the aftermath budget', () => {
    const c = makeDocketCase({ epilogue: prose(20) })
    expect(checkDocketCase(c).join()).toMatch(/aftermath/)
  })

  it('flags an accused that does not resolve to a defence-side cast member', () => {
    const missing = makeDocketCase()
    missing.accused = { ...missing.accused, cast_id: 'ghost' }
    expect(checkDocketCase(missing).join()).toMatch(/not in the cast/)

    const wrongSide = makeDocketCase()
    wrongSide.accused = { ...wrongSide.accused, cast_id: 'w1' }
    expect(checkDocketCase(wrongSide).join()).toMatch(/defence-side cast member/)
  })

  it('flags a burden beat that is not a court direction', () => {
    const c = makeDocketCase()
    c.beats = c.beats.map((b) =>
      b.tags.includes('burden')
        ? { ...b, kind: 'witness' as const, speaker: 'w1', mode: 'examination' as const }
        : b,
    )
    expect(checkDocketCase(c).join()).toMatch(/judge's instruction/)
  })
})

describe('checkDocketQueue', () => {
  it('accepts a varied queue and keeps v1 uniqueness rules', () => {
    const guilty = () => {
      const c = makeDocketCase({ verdict_truth: 'Guilty' })
      // Flip the design so a Guilty truth stays solvable: trap now argues
      // innocence, decisive beats argue guilt.
      c.beats = c.beats.map((b) => {
        if (b.reveal_stamp === 'misleading') return { ...b, direction: 'innocence' as const }
        if (b.reveal_stamp === 'decisive') return { ...b, direction: 'guilt' as const }
        return b
      })
      return c
    }
    const q = [
      makeDocketCase({ id: 'dd-0001', publish_date: '2026-08-01', title: 'A' }),
      { ...guilty(), id: 'dd-0002', publish_date: '2026-08-02', title: 'B' },
      makeDocketCase({ id: 'dd-0003', publish_date: '2026-08-03', title: 'C' }),
    ]
    expect(checkDocketQueue(q)).toEqual([])
  })

  it('flags duplicate ids', () => {
    const q = [
      makeDocketCase({ id: 'dd-0001', publish_date: '2026-08-01', title: 'A' }),
      makeDocketCase({ id: 'dd-0001', publish_date: '2026-08-02', title: 'B' }),
    ]
    expect(checkDocketQueue(q).map((i) => i.message).join()).toMatch(/duplicate id/)
  })

  it('flags a run of more than three identical verdicts', () => {
    const q = ['01', '02', '03', '04'].map((n, i) =>
      makeDocketCase({
        id: `dd-00${n}`,
        publish_date: `2026-08-0${i + 1}`,
        title: `T${n}`,
      }),
    )
    expect(checkDocketQueue(q).map((i) => i.message).join()).toMatch(/in a row/)
  })
})
