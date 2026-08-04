import type { SceneCue, SceneCueTurn } from '../model/schema'
import { DIALOGUE_SPEAKER_ALIASES } from './dialogueSpeakers'

/**
 * Split labelled dialogue into subordinate spoken turns. Turn ids are stable
 * media anchors; the parent SceneCue remains the only progress and legal id.
 */
export function splitCueTurns(cue: SceneCue): SceneCueTurn[] {
  const aliases = Object.keys(DIALOGUE_SPEAKER_ALIASES)
    .sort((left, right) => right.length - left.length)
  const pattern = new RegExp(`(?:^|\\s)(${aliases.join('|')}):\\s*`, 'gu')
  const text = cue.text.trim()
  const matches = [...text.matchAll(pattern)]
  if (matches.length === 0) return [{ id: cue.id, speaker: cue.speaker, text }]

  const turns: SceneCueTurn[] = []
  const firstIndex = matches[0].index ?? 0
  if (firstIndex > 0) {
    const preface = text.slice(0, firstIndex).trim()
    if (preface) turns.push({ id: `${cue.id}__pre`, speaker: cue.speaker, text: preface })
  }
  matches.forEach((match, index) => {
    const alias = match[1]
    const speaker = DIALOGUE_SPEAKER_ALIASES[alias]
    if (!speaker) throw new Error(`Unknown dialogue alias ${alias} in ${cue.id}`)
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length
    const turnText = text.slice(start, end).trim()
    if (!turnText) throw new Error(`Empty spoken turn ${index + 1} in ${cue.id}`)
    turns.push({ id: `${cue.id}__${index + 1}`, speaker, text: turnText })
  })
  return turns
}

export function attachCueTurns(cue: SceneCue): SceneCue {
  return { ...cue, turns: splitCueTurns(cue) }
}
