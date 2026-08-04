import type { SceneCue } from '../model/schema'
import { DIALOGUE_SPEAKER_ALIASES } from './dialogueSpeakers'

export const CAPTION_CUE_CHARACTER_LIMIT = 64

const naturalBreak = /[.!?;…”’]$/u
const shortTailLimit = 32

function rebalanceShortTail(parts: string[]): string[] {
  if (parts.length < 2 || parts.at(-1)!.length >= shortTailLimit) return parts
  const combinedWords = `${parts.at(-2)} ${parts.at(-1)}`.split(' ')
  const candidates = combinedWords.slice(1).map((_, index) => {
    const splitAt = index + 1
    const left = combinedWords.slice(0, splitAt).join(' ')
    const right = combinedWords.slice(splitAt).join(' ')
    return { left, right, score: Math.abs(left.length - right.length) }
  }).filter(({ left, right }) => (
    left.length <= CAPTION_CUE_CHARACTER_LIMIT &&
    right.length <= CAPTION_CUE_CHARACTER_LIMIT
  )).sort((left, right) => left.score - right.score)[0]
  if (!candidates) return parts
  return [...parts.slice(0, -2), candidates.left, candidates.right]
}

/**
 * Splits one authored spoken cue at word or nearby punctuation boundaries.
 * Joining the returned text with one space reconstructs the source verbatim;
 * sourceCueId keeps timing, evidence and legal provenance attached to that
 * single authored utterance.
 */
export function paceCueForCaptions(cue: SceneCue): SceneCue[] {
  if (cue.text.length <= CAPTION_CUE_CHARACTER_LIMIT) return [cue]
  const words = cue.text.trim().split(/\s+/u)
  const parts: string[] = []
  let start = 0

  while (start < words.length) {
    let end = start
    let length = 0
    let preferredEnd = -1
    while (end < words.length) {
      const nextLength = length + (length ? 1 : 0) + words[end].length
      if (nextLength > CAPTION_CUE_CHARACTER_LIMIT) break
      length = nextLength
      end += 1
      if (length >= CAPTION_CUE_CHARACTER_LIMIT * 0.55 && naturalBreak.test(words[end - 1])) {
        preferredEnd = end
      }
    }
    const selectedEnd = preferredEnd > start ? preferredEnd : Math.max(start + 1, end)
    parts.push(words.slice(start, selectedEnd).join(' '))
    start = selectedEnd
  }

  let activeSpeaker = cue.speaker
  const aliasPattern = new RegExp(`(?:^|\\s)(${Object.keys(DIALOGUE_SPEAKER_ALIASES).join('|')}):`, 'gu')
  return rebalanceShortTail(parts).map((text, index) => {
    const matches = [...text.matchAll(aliasPattern)]
    const firstAlias = matches[0]
    const speaker = index > 0 && firstAlias?.index === 0
      ? DIALOGUE_SPEAKER_ALIASES[firstAlias[1]] ?? activeSpeaker
      : activeSpeaker
    for (const match of matches) {
      activeSpeaker = DIALOGUE_SPEAKER_ALIASES[match[1]] ?? activeSpeaker
    }
    return {
      ...cue,
      id: index === 0 ? cue.id : `${cue.id}--caption-${index + 1}`,
      sourceCueId: cue.id,
      admissionStatus: index === 0 ? cue.admissionStatus : undefined,
      speaker,
      text,
    }
  })
}
