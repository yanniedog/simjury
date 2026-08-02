/** Return every spoken courtroom line in exact authored turn-anchor order. */
export function courtroomLines(beat) {
  const turns = beat.turns ?? [{ speaker: beat.speaker, text: beat.text }]
  const interjections = beat.interjections ?? []
  const lines = []
  const appendAt = (afterTurn) => {
    for (const interjection of interjections) {
      if (interjection.after_turn === afterTurn) {
        lines.push({ speaker: interjection.speaker, text: interjection.text })
      }
    }
  }
  appendAt(0)
  turns.forEach((turn, index) => {
    lines.push(turn)
    appendAt(index + 1)
  })
  return lines
}
