import type { DocketCaseV4 } from './caseSchema'

export function v4CourtroomCompatibilityIssue(
  trial: Pick<DocketCaseV4, 'id' | 'beats'>,
): string | null {
  const unsupported = trial.beats.find((beat) => beat.interjections?.length)
  return unsupported
    ? `V4 case ${trial.id} cannot open safely: beat ${unsupported.id} contains courtroom interjections, but the ordered player is not installed.`
    : null
}
