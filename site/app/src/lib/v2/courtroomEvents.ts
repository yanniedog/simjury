import type {
  AdmissibilityEffect,
  DocketBeat,
  DocketBeatV4,
  DocketInterjection,
} from './caseSchema'

export type CourtroomSpokenEvent =
  | {
      kind: 'turn'
      speaker: string
      text: string
      turnIndex: number
    }
  | {
      kind: 'interjection'
      speaker: string
      text: string
      interjection: DocketInterjection
    }

/** Interleave authored objections and rulings at their exact turn anchors. */
export function courtroomEventsForBeat(
  beat: DocketBeat | DocketBeatV4,
): CourtroomSpokenEvent[] {
  const turns = beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]
  const interjections =
    'interjections' in beat ? (beat.interjections ?? []) : []
  const events: CourtroomSpokenEvent[] = []

  const appendAt = (afterTurn: number) => {
    for (const interjection of interjections) {
      if (interjection.after_turn === afterTurn) {
        events.push({
          kind: 'interjection',
          speaker: interjection.speaker,
          text: interjection.text,
          interjection,
        })
      }
    }
  }

  appendAt(0)
  turns.forEach((turn, turnIndex) => {
    events.push({ kind: 'turn', ...turn, turnIndex })
    appendAt(turnIndex + 1)
  })
  return events
}

export function admissibilityEffectForBeat(
  beat: DocketBeat | DocketBeatV4,
): AdmissibilityEffect | null {
  if (!('interjections' in beat)) return null
  const ruling = [...(beat.interjections ?? [])]
    .reverse()
    .find((item) => item.type === 'sustained' || item.type === 'ruling')
  return ruling && (ruling.type === 'sustained' || ruling.type === 'ruling')
    ? ruling.admissibility
    : null
}
