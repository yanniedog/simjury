import { describe, expect, it } from 'vitest'
import type { DocketBeatV4 } from './caseSchema'
import {
  admissibilityEffectForBeat,
  courtroomEventsForBeat,
} from './courtroomEvents'

function beat(): DocketBeatV4 {
  return {
    id: 'cross-one',
    kind: 'witness',
    title: 'Cross of the records officer',
    text: 'Fallback text.',
    speaker: 'witness',
    mode: 'cross',
    direction: 'innocence',
    salience: 0.5,
    tags: ['credibility'],
    turns: [
      { speaker: 'defence', text: 'Who supplied that name?' },
      { speaker: 'witness', text: 'A caller whose name I did not record.' },
    ],
    interjections: [
      {
        id: 'hearsay-call',
        after_turn: 2,
        speaker: 'prosecution',
        type: 'objection',
        ground: 'hearsay',
        text: 'Objection, hearsay.',
      },
      {
        id: 'hearsay-call-ruling',
        after_turn: 2,
        speaker: 'judge',
        type: 'sustained',
        resolves: 'hearsay-call',
        admissibility: { effect: 'exclude_beat' },
        text: 'Sustained. Disregard that answer.',
      },
    ],
  }
}

describe('courtroom event sequence', () => {
  it('places an objection and its ruling immediately after the anchored turn', () => {
    const events = courtroomEventsForBeat(beat())
    expect(events.map(({ kind, speaker }) => `${kind}:${speaker}`)).toEqual([
      'turn:defence',
      'turn:witness',
      'interjection:prosecution',
      'interjection:judge',
    ])
    expect(admissibilityEffectForBeat(beat())).toEqual({
      effect: 'exclude_beat',
    })
  })

  it('keeps legacy beats unchanged', () => {
    const legacy = { ...beat() }
    delete legacy.interjections
    expect(courtroomEventsForBeat(legacy)).toHaveLength(2)
    expect(admissibilityEffectForBeat(legacy)).toBeNull()
  })
})
