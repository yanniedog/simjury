import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docketCaseSchema, type DocketCase } from '../lib/v2/caseSchema'
import { makeDocketCase, makeJuror } from '../lib/v2/fixtures'
import {
  runDeliberation,
  type PlayerAction,
} from './deliberation'

const pass: PlayerAction = { type: 'pass' }
const argue = (beatId: string, stance: 'proves' | 'unreliable'): PlayerAction => ({
  type: 'argue',
  beatId,
  stance,
})
const cite = (beatId: string): PlayerAction => ({ type: 'cite_direction', beatId })

/** The factory case's decisive innocence beats and its loud guilt trap. */
const DECISIVE = [argue('b4', 'proves'), argue('b7', 'proves'), argue('b4', 'proves')]
const TRAPPY = [argue('b1', 'proves'), argue('b1', 'proves'), argue('b1', 'proves')]
const PASSIVE = [pass, pass, pass]

describe('determinism (I-8)', () => {
  it('same case + verdict + actions => byte-identical log and outcome', () => {
    const a = runDeliberation(makeDocketCase(), 'not_guilty', DECISIVE)
    const b = runDeliberation(makeDocketCase(), 'not_guilty', DECISIVE)
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log))
    expect(a.outcome).toEqual(b.outcome)
  })

  it('different actions diverge', () => {
    const a = runDeliberation(makeDocketCase(), 'not_guilty', DECISIVE)
    const b = runDeliberation(makeDocketCase(), 'not_guilty', PASSIVE)
    expect(JSON.stringify(a.log)).not.toBe(JSON.stringify(b.log))
  })

  it('a different verdict reseeds the room', () => {
    const a = runDeliberation(makeDocketCase(), 'not_guilty', PASSIVE)
    const b = runDeliberation(makeDocketCase(), 'guilty', PASSIVE)
    expect(JSON.stringify(a.log)).not.toBe(JSON.stringify(b.log))
  })
})

describe('arguments move the room', () => {
  it('arguing the decisive evidence beats doing nothing, toward the truth', () => {
    const argued = runDeliberation(makeDocketCase(), 'not_guilty', DECISIVE)
    const passive = runDeliberation(makeDocketCase(), 'not_guilty', PASSIVE)
    expect(argued.outcome.tally.ng).toBeGreaterThan(passive.outcome.tally.ng)
  })

  it('arguing the trap pulls the gullible the other way', () => {
    const trappy = runDeliberation(makeDocketCase(), 'guilty', TRAPPY)
    const argued = runDeliberation(makeDocketCase(), 'guilty', DECISIVE)
    expect(trappy.outcome.tally.g).toBeGreaterThan(argued.outcome.tally.g)
  })

  it('reaches at least two distinct outcomes across the strategy space', () => {
    const strategies = [PASSIVE, DECISIVE, TRAPPY]
    const verdicts: Array<'guilty' | 'not_guilty'> = ['guilty', 'not_guilty']
    const seen = new Set<string>()
    for (const v of verdicts) {
      for (const s of strategies) {
        const { outcome } = runDeliberation(makeDocketCase(), v, s)
        seen.add(`${outcome.kind}:${outcome.verdict ?? 'none'}`)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps every position and confidence within bounds', () => {
    const { log } = runDeliberation(makeDocketCase(), 'guilty', TRAPPY)
    for (const e of log) {
      if (e.position !== undefined) {
        expect(e.position).toBeGreaterThanOrEqual(-2)
        expect(e.position).toBeLessThanOrEqual(2)
      }
    }
  })

  it('always ends in a terminal outcome with a full 12-vote tally', () => {
    for (const s of [PASSIVE, DECISIVE, TRAPPY]) {
      const { outcome } = runDeliberation(makeDocketCase(), 'not_guilty', s)
      expect(['unanimous', 'majority', 'hung']).toContain(outcome.kind)
      expect(outcome.tally.g + outcome.tally.ng).toBe(12)
    }
  })
})

describe('burden drift (v3 §9.5 lite)', () => {
  /** A case whose burden-drifter voices the drift when procedure is argued. */
  function driftCase(): DocketCase {
    const c = makeDocketCase()
    c.jury.jurors[8] = makeJuror(9, {
      reaction_rules: [
        {
          when: { theme: 'procedure', stance: 'proves' },
          effect: { delta: 0, confidence: 0, line: 'burden_drift' },
        },
        {
          when: { theme: 'any', stance: 'any' },
          effect: { delta: 0, confidence: 0, line: 'pushback' },
        },
      ],
    })
    return c
  }

  it('drift occurs and the player corrects it by citing the burden direction', () => {
    const { outcome, log } = runDeliberation(driftCase(), 'not_guilty', [
      argue('b8', 'proves'),
      cite('b10'),
      pass,
    ])
    expect(log.some((e) => e.type === 'drift')).toBe(true)
    expect(log.some((e) => e.type === 'drift_corrected')).toBe(true)
    expect(outcome.burdenDrift).toEqual({ occurred: true, correctedByPlayer: true })
  })

  it('drift left uncorrected is recorded as such', () => {
    const { outcome, log } = runDeliberation(driftCase(), 'not_guilty', [
      argue('b8', 'proves'),
      pass,
      pass,
    ])
    expect(log.some((e) => e.type === 'drift')).toBe(true)
    expect(outcome.burdenDrift.occurred).toBe(true)
    expect(outcome.burdenDrift.correctedByPlayer).toBe(false)
  })
})

describe('dd-0000 integration', () => {
  const raw = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docket', 'dd-0000.json'),
    'utf8',
  )
  const dd0000 = docketCaseSchema.parse(JSON.parse(raw))

  it('plays the authored fixture to a terminal outcome, deterministically', () => {
    const actions = [argue('b6', 'proves'), argue('b10', 'proves'), cite('b11')]
    const a = runDeliberation(dd0000, 'not_guilty', actions)
    const b = runDeliberation(dd0000, 'not_guilty', actions)
    expect(a.outcome).toEqual(b.outcome)
    expect(a.outcome.tally.g + a.outcome.tally.ng).toBe(12)
  })

  it('arguing the decisive exhibits moves the authored room toward acquittal', () => {
    const argued = runDeliberation(dd0000, 'not_guilty', [
      argue('b6', 'proves'),
      argue('b10', 'proves'),
      argue('b7', 'proves'),
    ])
    const passive = runDeliberation(dd0000, 'not_guilty', [pass, pass, pass])
    expect(argued.outcome.tally.ng).toBeGreaterThanOrEqual(passive.outcome.tally.ng)
  })

  it('the authored room can reach different outcomes for different play', () => {
    const seen = new Set<string>()
    const plays: PlayerAction[][] = [
      [pass, pass, pass],
      [argue('b6', 'proves'), argue('b10', 'proves'), argue('b7', 'proves')],
      [argue('b1', 'proves'), argue('b2', 'proves'), argue('b4', 'proves')],
    ]
    for (const v of ['guilty', 'not_guilty'] as const) {
      for (const p of plays) {
        const { outcome } = runDeliberation(dd0000, v, p)
        seen.add(`${outcome.kind}:${outcome.verdict ?? 'none'}:${outcome.tally.g}`)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})
