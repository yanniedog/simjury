import type { DeliberationPack, ReasoningContribution, ReasoningMove } from './schema'

/** Human-facing copy; saved records continue to use the canonical move tokens. */
export const reasoningMoveLabels: Readonly<Record<ReasoningMove, string>> = {
  connect: 'Connect admitted evidence',
  distinguish: 'Distinguish competing evidence',
  'test-source': 'Test the source',
  'challenge-inference': 'Challenge an inference',
  'raise-alternative': 'Raise a reasonable alternative',
  'apply-burden': 'Apply the burden of proof',
}

export const preSecondBallotContributionSceneIds = [
  'sat-room',
  'sat-concerns',
  'sat-first-ballot',
  'sat-causation',
  'sat-improper',
  'sat-separate',
  'sun-resume',
  'sun-negligence',
] as const

export const furtherDiscussionContributionSceneIds = ['sun-persevere'] as const

const recordedReflectionSceneIds = [
  'fri-crown-close',
  'fri-defence-close',
  ...preSecondBallotContributionSceneIds,
  ...furtherDiscussionContributionSceneIds,
  'sun-analysis',
] as const

const recordedReflectionSceneIdSet = new Set<string>(recordedReflectionSceneIds)
const preSecondBallotSceneIdSet = new Set<string>(preSecondBallotContributionSceneIds)
const furtherDiscussionSceneIdSet = new Set<string>(furtherDiscussionContributionSceneIds)

export function contributionStage(sceneId: string): 'pre-second-ballot' | 'further-discussion' | null {
  if (preSecondBallotSceneIdSet.has(sceneId)) return 'pre-second-ballot'
  if (furtherDiscussionSceneIdSet.has(sceneId)) return 'further-discussion'
  return null
}

/** One authored reasoning interaction can record at most one private contribution. */
export function hasValidContributionJourney(
  contributions: ReasoningContribution[],
  pack: DeliberationPack,
): boolean {
  const seen = new Set<string>()
  return contributions.every((contribution) => {
    if (!recordedReflectionSceneIdSet.has(contribution.sceneId) || seen.has(contribution.sceneId)) {
      return false
    }
    seen.add(contribution.sceneId)
    const proposition = pack.propositions.find(({ id }) => id === contribution.propositionId)
    return Boolean(
      proposition &&
      proposition.sceneIds.includes(contribution.sceneId) &&
      proposition.legalQuestion === contribution.legalQuestion &&
      proposition.evidenceIds.includes(contribution.evidenceId) &&
      proposition.moves.includes(contribution.move),
    )
  })
}
