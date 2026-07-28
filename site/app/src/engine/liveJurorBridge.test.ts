import { describe, expect, it, vi } from 'vitest'
import type { LiveRoomEvent } from '../lib/liveJuryConnection'
import { makeDocketCase } from '../lib/v2/fixtures'
import {
  buildHybridTranscript,
  LIVE_BRIDGE_HISTORY_EVENTS,
} from './liveJurorBridge'

function message(
  sequence: number,
  seatId: number,
  text: string,
  displayName = `Human ${seatId}`,
): LiveRoomEvent {
  return {
    type: 'event',
    event_type: 'message',
    sequence,
    seat_id: seatId,
    display_name: displayName,
    text,
  }
}

describe('deterministic live-juror bridge', () => {
  it('answers multiple humans after their own chronologically ordered messages', () => {
    const trial = makeDocketCase()
    const transcript = buildHybridTranscript(trial, [
      message(2, 2, 'The computer log does not prove guilt.'),
      message(1, 1, 'I have reasonable doubt about the burden of proof.'),
    ])

    const humans = transcript.filter((item) => item.kind === 'human')
    const authored = transcript.filter((item) => item.kind === 'authored')
    expect(humans.map(({ event }) => event.sequence)).toEqual([1, 2])
    expect(authored.some(({ sourceSequence }) => sourceSequence === 1)).toBe(true)
    expect(authored.some(({ sourceSequence }) => sourceSequence === 2)).toBe(true)
    for (const item of authored) {
      expect(trial.jury.jurors.some(({ id }) => id === item.jurorId)).toBe(true)
      expect(item.jurorLabel).toMatch(/^Juror /)
    }
  })

  it('asks an honest clarification for ambiguous or novel input', () => {
    const transcript = buildHybridTranscript(
      makeDocketCase(),
      [message(1, 1, 'The other thing feels off somehow.')],
    )
    const reply = transcript.find((item) => item.kind === 'authored')
    expect(reply).toMatchObject({ kind: 'authored', responseKind: 'clarify' })
    if (reply?.kind === 'authored') {
      expect(reply.text).toContain("don't want to guess")
      expect(reply.text).not.toContain('proves')
    }
  })

  it('recognises same-concern paraphrases without replaying a canned factual answer', () => {
    const transcript = buildHybridTranscript(makeDocketCase(), [
      message(1, 1, "I don't trust point 4's device record."),
      message(2, 2, 'The computer log at point 4 seems unreliable.'),
    ])
    const secondReplies = transcript.filter(
      (item) => item.kind === 'authored' && item.sourceSequence === 2,
    )
    expect(secondReplies).toHaveLength(1)
    expect(secondReplies[0]).toMatchObject({ responseKind: 'repeat' })
    if (secondReplies[0]?.kind === 'authored') {
      expect(secondReplies[0].text).toContain('same digital forensics concern')
      expect(secondReplies[0].text).toContain('What new part of the record')
    }
  })

  it('lets the authored juror most engaged with the matched issue answer first', () => {
    const trial = makeDocketCase()
    const specialist = trial.jury.jurors[5]
    const wrongIssueSpecialist = trial.jury.jurors[0]
    specialist.weights.digital_forensics = 5
    wrongIssueSpecialist.weights.method = 9
    specialist.lines.pushback = ['Which part of the digital record identifies a person?']
    const reply = buildHybridTranscript(
      trial,
      [message(1, 1, 'Point 5 raises a digital forensics concern.')],
    ).find((item) => item.kind === 'authored')

    expect(reply).toMatchObject({
      kind: 'authored',
      jurorId: specialist.id,
      text: 'Which part of the digital record identifies a person?',
    })
  })

  it('asks which point a generic issue refers to when several beats share it', () => {
    const reply = buildHybridTranscript(
      makeDocketCase(),
      [message(1, 1, 'Digital forensics worries me.')],
    ).find((item) => item.kind === 'authored')
    expect(reply).toMatchObject({ responseKind: 'clarify' })
    if (reply?.kind === 'authored') {
      expect(reply.text).toContain('more than one part of the record')
    }
  })

  it('does not collapse distinct evidence under the same issue into one thread', () => {
    const transcript = buildHybridTranscript(makeDocketCase(), [
      message(1, 1, 'Point 4 raises a digital forensics concern.'),
      message(2, 2, 'Point 5 raises a digital forensics concern.'),
    ])
    const second = transcript.filter(
      (item) => item.kind === 'authored' && item.sourceSequence === 2,
    )
    expect(second.length).toBeGreaterThan(0)
    expect(second.every(
      (item) => item.kind === 'authored' && item.responseKind === 'engage',
    )).toBe(true)
  })

  it('uses a no-match fallback instead of attributing a fact to the record', () => {
    const reply = buildHybridTranscript(
      makeDocketCase(),
      [message(7, 3, 'Purple umbrellas and lunch.')],
    ).find((item) => item.kind === 'authored')
    expect(reply).toMatchObject({ responseKind: 'clarify' })
    if (reply?.kind === 'authored') {
      expect(reply.text).toBe(
        "I don't want to guess what you mean. Name the witness, exhibit, legal element, or numbered point you want us to test.",
      )
    }
  })

  it('deduplicates reconnect history and derives byte-identical authored replies', () => {
    const trial = makeDocketCase()
    const event = message(3, 2, 'The digital record does not prove guilt.', 'Sam')
    const once = buildHybridTranscript(trial, [event])
    const reconnected = buildHybridTranscript(trial, [event, { ...event }])

    expect(reconnected).toEqual(once)
    expect(reconnected.filter((item) => item.kind === 'human')).toHaveLength(1)
    expect(new Set(reconnected.map(({ key }) => key)).size).toBe(reconnected.length)
  })

  it('keeps the first event and safely reports a conflicting duplicate sequence', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const first = message(4, 1, 'The digital record does not prove guilt.')
    const conflict = message(4, 2, 'A different contribution.', 'Morgan')
    const transcript = buildHybridTranscript(makeDocketCase(), [first, conflict])

    expect(transcript[0]).toEqual({ kind: 'human', key: 'human-4', event: first })
    expect(warning).toHaveBeenCalledWith(
      'Live jury sequence 4 conflicted; keeping its first event.',
    )
    expect(warning.mock.calls.flat().join(' ')).not.toContain(conflict.text)
    warning.mockRestore()
  })

  it('never turns position events into authored replies', () => {
    const position: LiveRoomEvent = {
      type: 'event',
      event_type: 'position',
      sequence: 1,
      seat_id: 1,
      display_name: 'Alex',
      position: 'NG',
      reason: 'The source remains uncertain.',
    }
    expect(buildHybridTranscript(makeDocketCase(), [position])).toEqual([
      { kind: 'human', key: 'human-1', event: position },
    ])
  })

  it('uses the server replay window so continuous and reconnected clients agree', () => {
    const events: LiveRoomEvent[] = Array.from(
      { length: LIVE_BRIDGE_HISTORY_EVENTS + 5 },
      (_, index) => ({
        type: 'event',
        event_type: 'position',
        sequence: index + 1,
        seat_id: 1,
        display_name: 'Alex',
        position: 'U',
      }),
    )
    const transcript = buildHybridTranscript(makeDocketCase(), events)
    const humans = transcript.filter((item) => item.kind === 'human')
    expect(humans).toHaveLength(LIVE_BRIDGE_HISTORY_EVENTS)
    expect(humans[0].event.sequence).toBe(6)
  })
})
