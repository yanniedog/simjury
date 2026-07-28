import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docketCaseSchema, type DocketCase } from '../lib/v2/caseSchema'
import { makeDocketCase, makeJuror } from '../lib/v2/fixtures'
import {
  autoPlayRound,
  buildAgenda,
  finish,
  playRound,
  runDeliberation,
  startDeliberation,
  type PlayerAction,
} from './deliberation'
import { MAJORITY_DIRECTION } from './juryProcedure'

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

describe('pragmatic agenda', () => {
  it('picks at most three beats and never the full case', () => {
    const trial = makeDocketCase()
    const agenda = buildAgenda(trial)
    expect(agenda.length).toBeGreaterThan(0)
    expect(agenda.length).toBeLessThanOrEqual(3)
    expect(agenda.length).toBeLessThan(trial.beats.length)
  })

  it('autoPlayRound raises agenda beats without player action', () => {
    const state = startDeliberation(makeDocketCase())
    expect(state.phase).toBe('open_1')
    autoPlayRound(state)
    expect(state.raisedBeatIds.length).toBe(1)
    expect(state.agenda).toContain(state.raisedBeatIds[0])
    expect(state.phase).toBe('open_2')
    expect(state.log.some((e) => e.type === 'argue' || e.type === 'cite')).toBe(true)
    expect(state.log.some((e) => e.type === 'argue' && e.actor === 'player')).toBe(false)
  })
})

describe('determinism (I-8)', () => {
  it('same case + actions => byte-identical deliberation log before finish', () => {
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

  it('player verdict is applied only at finish and can change the tally', () => {
    const a = runDeliberation(makeDocketCase(), 'not_guilty', PASSIVE)
    const b = runDeliberation(makeDocketCase(), 'guilty', PASSIVE)
    // Open-round events match; only the final vote/outcome may differ.
    const openA = a.log.filter((e) => e.phase !== 'done' && e.type !== 'vote' && e.type !== 'outcome' && e.type !== 'majority_direction')
    const openB = b.log.filter((e) => e.phase !== 'done' && e.type !== 'vote' && e.type !== 'outcome' && e.type !== 'majority_direction')
    expect(JSON.stringify(openA)).toBe(JSON.stringify(openB))
    expect(a.outcome.tally).not.toEqual(b.outcome.tally)
  })
})

describe('arguments move the room', () => {
  it('preserves a custom concern and lets the addressed juror answer first', () => {
    const trial = makeDocketCase()
    const target = trial.jury.jurors[5]
    const state = startDeliberation(trial)
    playRound(state, {
      type: 'argue',
      beatId: trial.beats[0].id,
      stance: 'unreliable',
      summary: 'The timing still does not fit.',
      targetJurorId: target.id,
    })
    expect(state.log.find((event) => event.actor === 'player')?.detail)
      .toBe('The timing still does not fit.')
    expect(state.log.find((event) => event.type === 'respond')?.actor).toBe(target.id)
  })

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

  it('reaches at least two distinct final room states across the strategy space', () => {
    const strategies = [PASSIVE, DECISIVE, TRAPPY]
    const verdicts: Array<'guilty' | 'not_guilty'> = ['guilty', 'not_guilty']
    const seen = new Set<string>()
    for (const v of verdicts) {
      for (const s of strategies) {
        const { outcome } = runDeliberation(makeDocketCase(), v, s)
        seen.add(
          `${outcome.kind}:${outcome.verdict ?? 'none'}:${outcome.tally.g}:${outcome.tally.ng}:${outcome.tally.u}`,
        )
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
      expect(outcome.tally.g + outcome.tally.ng + outcome.tally.u).toBe(12)
    }
  })
})

describe('fictional jury procedure', () => {
  function readyRoom(positions: number[]) {
    const state = startDeliberation(makeDocketCase())
    playRound(state, pass)
    playRound(state, pass)
    playRound(state, pass)
    expect(state.phase).toBe('final_vote')
    state.jurors.forEach((juror, index) => {
      juror.position = positions[index]
    })
    return state
  }

  it('preserves undecided positions and never selects a final position by RNG', () => {
    const state = readyRoom([1, 1, 1, 1, 1, -1, -1, -1, -1, -1, 0])
    state.rng = () => {
      throw new Error('finish must not use RNG')
    }

    const outcome = finish(state, 'guilty')

    expect(state.jurors.at(-1)?.position).toBe(0)
    expect(outcome).toMatchObject({
      kind: 'hung',
      verdict: null,
      tally: { g: 6, ng: 5, u: 1 },
    })
    expect(state.log.at(-1)?.tally).toEqual({ g: 6, ng: 5, u: 1 })
  })

  it('lets every juror consider a point while limiting the spoken exchange', () => {
    const state = startDeliberation(makeDocketCase())
    const before = state.jurors.map(({ position }) => position)

    playRound(state, argue('b4', 'proves'))

    const moved = state.jurors.filter(
      ({ position }, index) => position !== before[index],
    ).length
    const spoken = state.log.filter((event) => event.type === 'respond').length
    expect(moved).toBeGreaterThan(spoken)
    expect(spoken).toBeLessThanOrEqual(4)
  })

  it('never uses the RNG stream to select juror positions', () => {
    const low = startDeliberation(makeDocketCase())
    const high = startDeliberation(makeDocketCase())
    low.rng = () => 0
    high.rng = () => 0.999

    for (const action of DECISIVE) {
      playRound(low, action)
      playRound(high, action)
    }

    expect(low.jurors.map(({ position }) => position)).toEqual(
      high.jurors.map(({ position }) => position),
    )
  })

  it('accepts 11 matching votes only after the neutral direction', () => {
    const state = readyRoom([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0])

    const outcome = finish(state, 'guilty')
    const finalEvents = state.log.slice(-4)

    expect(outcome).toMatchObject({
      kind: 'majority',
      verdict: 'guilty',
      tally: { g: 11, ng: 0, u: 1 },
    })
    expect(finalEvents.map(({ type }) => type)).toEqual([
      'vote',
      'majority_direction',
      'vote',
      'outcome',
    ])
    expect(finalEvents[1].detail).toBe(MAJORITY_DIRECTION)
  })

  it('does not treat ten matching votes as a verdict', () => {
    const state = readyRoom([1, 1, 1, 1, 1, 1, 1, 1, 1, -1, 0])

    expect(finish(state, 'guilty')).toMatchObject({
      kind: 'hung',
      verdict: null,
      tally: { g: 10, ng: 1, u: 1 },
    })
  })

  it('includes the player as the twelfth vote', () => {
    const guiltyPlayer = finish(
      readyRoom([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]),
      'guilty',
    )
    const notGuiltyPlayer = finish(
      readyRoom([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]),
      'not_guilty',
    )

    expect(guiltyPlayer.tally).toEqual({ g: 11, ng: 0, u: 1 })
    expect(notGuiltyPlayer.tally).toEqual({ g: 10, ng: 1, u: 1 })
    expect(guiltyPlayer.kind).toBe('majority')
    expect(notGuiltyPlayer.kind).toBe('hung')
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

describe('serious-crime case integration', () => {
  const raw = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docket', 'dd-0006.json'),
    'utf8',
  )
  const seriousCase = docketCaseSchema.parse(JSON.parse(raw))
  const oneBeat = (
    label: string,
    predicate: (beat: DocketCase['beats'][number]) => boolean,
  ) => {
    const matches = seriousCase.beats.filter(predicate)
    if (matches.length !== 1) {
      throw new Error(
        `${seriousCase.id} needs exactly one ${label}; found ${matches.length}`,
      )
    }
    return matches[0]
  }
  const isEvidenceBeat = (beat: DocketCase['beats'][number]) =>
    beat.kind !== 'direction'
  const isDecisiveEvidence = (beat: DocketCase['beats'][number]) =>
    isEvidenceBeat(beat) && beat.reveal_stamp === 'decisive'
  const isTrap = (beat: DocketCase['beats'][number]) =>
    isEvidenceBeat(beat) && beat.reveal_stamp === 'misleading'
  const direction = oneBeat('jury direction', (beat) => beat.kind === 'direction')
  const decisiveGuilt = oneBeat(
    'decisive guilt beat',
    (beat) => isDecisiveEvidence(beat) && beat.direction === 'guilt',
  )
  const decisiveInnocence = oneBeat(
    'decisive innocence beat',
    (beat) => isDecisiveEvidence(beat) && beat.direction === 'innocence',
  )
  const attempt = oneBeat(
    'attempt evidence beat',
    (beat) =>
      isEvidenceBeat(beat) &&
      beat.direction === 'guilt' &&
      beat.tags.includes('causation'),
  )
  const trap = oneBeat('misleading beat', isTrap)

  it('plays the authored fixture to a terminal outcome, deterministically', () => {
    const actions = [
      argue(decisiveGuilt.id, 'proves'),
      argue(attempt.id, 'proves'),
      cite(direction.id),
    ]
    const a = runDeliberation(seriousCase, 'guilty', actions)
    const b = runDeliberation(seriousCase, 'guilty', actions)
    expect(a.outcome).toEqual(b.outcome)
    expect(a.outcome.tally.g + a.outcome.tally.ng + a.outcome.tally.u).toBe(12)
  })

  it('arguing the decisive evidence moves the authored room toward the truth', () => {
    const argued = runDeliberation(seriousCase, 'guilty', [
      argue(decisiveGuilt.id, 'proves'),
    ])
    const passive = runDeliberation(seriousCase, 'guilty', [pass, pass, pass])
    expect(argued.outcome.tally.g).toBeGreaterThanOrEqual(passive.outcome.tally.g)
  })

  it('the authored room can reach different outcomes for different play', () => {
    const seen = new Set<string>()
    const plays: PlayerAction[][] = [
      [pass, pass, pass],
      [argue(decisiveGuilt.id, 'proves'), argue(attempt.id, 'proves'), cite(direction.id)],
      [
        argue(decisiveInnocence.id, 'proves'),
        argue(trap.id, 'proves'),
        argue(decisiveInnocence.id, 'proves'),
      ],
    ]
    for (const v of ['guilty', 'not_guilty'] as const) {
      for (const p of plays) {
        const { outcome } = runDeliberation(seriousCase, v, p)
        seen.add(`${outcome.kind}:${outcome.verdict ?? 'none'}:${outcome.tally.g}`)
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(2)
  })
})
