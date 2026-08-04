import type { SceneCue } from '../model/schema'

const replaySuppressedCueIds = new Set(['wed-blurt'])

export function isReplaySuppressedCue(cue: SceneCue): boolean {
  return replaySuppressedCueIds.has(cue.id)
}

export function nextReplaySafeCue(
  cues: SceneCue[],
  currentIndex: number,
  isReplay: boolean,
): SceneCue | undefined {
  const remaining = cues.slice(currentIndex + 1)
  return isReplay
    ? remaining.find((cue) => !isReplaySuppressedCue(cue))
    : remaining[0]
}

/**
 * Defence in depth for stale or imported progress that lands directly on the
 * struck answer. Normal replay traversal skips this cue before presentation.
 */
export function replaySafeCue(cue: SceneCue, isReplay: boolean): SceneCue {
  if (!isReplay || !isReplaySuppressedCue(cue)) return cue
  const { audio: _audio, ...withoutAudio } = cue
  void _audio
  return {
    ...withoutAudio,
    speaker: 'Court officer',
    tone: 'formal',
    text: 'The struck response is not repeated on replay. Continue to the judge\'s ruling.',
    accessibleProposition: 'Replay omits the struck response and proceeds directly to the ruling that it is legally absent.',
  }
}
