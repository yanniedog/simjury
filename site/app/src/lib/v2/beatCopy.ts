import type { CourtroomBeat, CourtroomTrial } from './caseSchema'

/**
 * Name the outcome on the button.
 *
 * "Next →" fourteen times never tells you where you are or what is coming.
 * Openings already does this well with "Call the first witness"; the beats
 * follow it. See docs/DESIGN-PROTOCOL.md rule 9.
 */
export function nextBeatLabel(
  trial: CourtroomTrial,
  beat: CourtroomBeat,
  next: CourtroomBeat | undefined,
): string {
  if (!next) return 'Hear the closing arguments'
  const speaker = trial.cast.find((member) => member.id === next.speaker)
  if (next.kind === 'exhibit') return 'Turn to the next exhibit'
  if (next.kind !== 'witness') return 'Hear the judge’s direction'
  const name = speaker?.name
  if (!name) return 'Call the next witness'
  if (next.mode === 'cross') return `Cross-examine ${name}`
  // Long examinations run several beats with the same witness. "Hear Ivo Tarn"
  // three times in a row is only marginally better than "Next →" three times:
  // it names who, but not that you are staying with them.
  if (next.speaker === beat.speaker) return `Continue with ${name}`
  return `Hear ${name}`
}
