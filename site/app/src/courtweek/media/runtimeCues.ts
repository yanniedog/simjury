/**
 * Cues whose spoken text is substituted at runtime from the player's returned
 * verdict / analysis pack. Prerecorded audio must not bind these cue ids; the
 * player falls back to device speech using the substituted text.
 */
export const RUNTIME_DEPENDENT_CUE_IDS = new Set([
  'sun-verdict-return',
  'sun-analysis',
])

export function isRuntimeDependentCue(cueId: string): boolean {
  return RUNTIME_DEPENDENT_CUE_IDS.has(cueId)
}

export function prerecordedCueIds(cueIds: readonly string[]): string[] {
  return cueIds.filter((cueId) => !RUNTIME_DEPENDENT_CUE_IDS.has(cueId))
}
