const dayToken = '(?:0?[1-7]|one|two|three|four|five|six|seven)'
const weekdayToken = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)'

const semanticUnlockModule = new RegExp(
  String.raw`(?:^|[/\\])(?:` +
    String.raw`day${dayToken}(?:[-_.]|unlock|key|$)|` +
    String.raw`${weekdayToken}(?:[-_.]|unlock|key|$)|` +
    String.raw`(?:unlock|unlocked|locked|sealed)(?:[-_./\\]?(?:keys?|${dayToken}))(?:[-_./\\]|$)` +
  String.raw`)`,
  'iu',
)

/** Match module/path-like unlock names without rejecting schedule fields such as unlockAt. */
export function hasSemanticUnlockModuleReference(value: string): boolean {
  return semanticUnlockModule.test(value)
}
