export const V4_DURATION_MINUTES_MIN = 14
export const V4_DURATION_MINUTES_MAX = 16
export const V4_SPOKEN_WORDS_PER_MINUTE = 150

/**
 * Time reserved for courtroom transitions, exhibit inspection, substantive
 * deliberation, and the result/reveal. The spoken-content estimate is added
 * to this allowance; neither runtime speed nor a self-reported case field can
 * make an under-length or over-length V4 case pass validation.
 */
export const V4_INTERACTION_MINUTES = 9

interface DurationText {
  text: string
}

export interface V4DurationSource {
  setting: string
  charge: string
  elements: string[]
  hook: string
  accused: { human: string }
  statements: {
    opening: { prosecution: DurationText; defence: DurationText }
    closing: { prosecution: DurationText; defence: DurationText }
  }
  beats: Array<{
    text: string
    turns?: Array<DurationText>
  }>
}

export interface V4DurationEstimate {
  sceneWords: number
  statementWords: number
  evidenceWords: number
  spokenWords: number
  spokenMinutes: number
  interactionMinutes: number
  totalMinutes: number
}

export function durationWordCount(text: string): number {
  const words = text.trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

export function estimateV4Duration(
  trial: V4DurationSource,
): V4DurationEstimate {
  const sceneWords = [
    trial.setting,
    trial.charge,
    ...trial.elements,
    trial.hook,
    trial.accused.human,
  ].reduce((total, text) => total + durationWordCount(text), 0)
  const statementWords = [
    trial.statements.opening.prosecution.text,
    trial.statements.opening.defence.text,
    trial.statements.closing.prosecution.text,
    trial.statements.closing.defence.text,
  ].reduce((total, text) => total + durationWordCount(text), 0)
  const evidenceWords = trial.beats.reduce((total, beat) => {
    // Turns are the spoken dialogue. When present, beat.text is the same
    // transcript (or a summary) and must not be double-counted.
    const spokenText =
      beat.turns && beat.turns.length > 0
        ? beat.turns.map((turn) => turn.text).join(' ')
        : beat.text
    return total + durationWordCount(spokenText)
  }, 0)
  const spokenWords = sceneWords + statementWords + evidenceWords
  const spokenMinutes = spokenWords / V4_SPOKEN_WORDS_PER_MINUTE
  const totalMinutes = spokenMinutes + V4_INTERACTION_MINUTES

  return {
    sceneWords,
    statementWords,
    evidenceWords,
    spokenWords,
    spokenMinutes,
    interactionMinutes: V4_INTERACTION_MINUTES,
    totalMinutes,
  }
}
