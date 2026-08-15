import { extname } from 'node:path'

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

const textualProductionExtensions = new Set([
  '.cjs', '.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.vtt',
  '.webmanifest', '.xml', '.yaml', '.yml',
])
export const isTextualProductionAsset = (file: string): boolean =>
  textualProductionExtensions.has(extname(file).toLocaleLowerCase('en-US'))

export const REVIEW_ONLY_CONTRACT_MARKERS = [
  'simjury.court-week-pronounceability/v1',
  'simjury.court-week-voice-distinctness/v1',
  'simjury.court-week-voice-asr-receipt/v1',
  'simjury.court-week-voice-acceptance-bundle/v1',
  'simjury.court-week-voice-acceptance-operator-key/v1',
  'simjury.court-week-voice-exact-source/v1',
  'simjury.court-week-voice-loudness-analysis/v1',
  'simjury.court-week-voice-name-projection/v1',
  'simjury.court-week-voice-acceptance-decisions/v1',
  'simjury.court-week-voice-acceptance-listener-submission/v1',
  'simjury.court-week-voice-acceptance-approval/v1',
  'simjury.court-week-raw-asr/v1',
  'simjury.court-week-raw-alignment/v1',
  'simjury.court-week-candidate-projection/v1',
] as const

export const reviewOnlyContractMarker = (text: string): string | undefined =>
  REVIEW_ONLY_CONTRACT_MARKERS.find((marker) => text.includes(marker))
