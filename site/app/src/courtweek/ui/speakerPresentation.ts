const FOREPERSON_PREFIX = 'Foreperson '

export function canonicalSpeakerName(speaker: string): string {
  const trimmed = speaker.trim()
  return trimmed.startsWith(FOREPERSON_PREFIX) ? trimmed.slice(FOREPERSON_PREFIX.length) : trimmed
}

function speakerHash(speaker: string): number {
  let hash = 2166136261
  for (const character of canonicalSpeakerName(speaker)) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Stable, high-contrast identity colour for courtroom captions. The spoken
 * name remains printed before every line, so colour is a supporting cue only.
 */
export function speakerCaptionColour(speaker: string): string {
  const hue = (speakerHash(speaker) / 0xffffffff) * 360
  return `hsl(${hue.toFixed(4)}deg 74% 82%)`
}
