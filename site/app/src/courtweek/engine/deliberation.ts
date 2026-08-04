import type {
  DeliberationPack,
  ReasoningContribution,
  Verdict,
} from '../model/schema'
import { contributionStage } from '../model/deliberationContract'

export type BallotAggregate = Record<Verdict, number>
export type Agreement = 'unanimous' | 'majority' | 'hung'

export interface DeliberationResult {
  aggregate: BallotAggregate
  verdict: Verdict
  agreement: Agreement
  majorityAuthorized: boolean
}

export interface FinalBallotInput {
  pack: DeliberationPack
  secondVote: Verdict
  finalVote: Verdict
  contributions: ReasoningContribution[]
  secondBallotWasUnanimous: boolean
  majorityDirectionReceived: boolean
  elapsedCourtHours: number
}

export type ReasoningContributionDraft = Omit<ReasoningContribution, 'influencePenalty'> & {
  improperClaim?: string | null
}

export interface ReasoningAssessment {
  contribution: ReasoningContribution
  correction: string | null
}

const verdicts: Verdict[] = ['murder', 'manslaughter', 'not-guilty', 'unable-to-agree']

function cloneBallot(ballot: BallotAggregate): BallotAggregate {
  return { ...ballot }
}

function total(ballot: BallotAggregate): number {
  return verdicts.reduce((sum, verdict) => sum + ballot[verdict], 0)
}

function assertTotal(ballot: BallotAggregate, expected: number): void {
  if (total(ballot) !== expected) throw new Error(`Ballot must total ${expected}.`)
}

export function aggregateFirstBallot(
  pack: DeliberationPack,
  playerVote: Verdict,
): BallotAggregate {
  const aggregate = cloneBallot(pack.firstBallot)
  aggregate[playerVote] += 1
  assertTotal(aggregate, 12)
  return aggregate
}

export function firstBallotForScene(
  pack: DeliberationPack,
  sceneId: string,
  sealedPlayerVote?: Verdict,
): BallotAggregate | null {
  return sceneId === 'sat-first-ballot' && sealedPlayerVote
    ? aggregateFirstBallot(pack, sealedPlayerVote)
    : null
}

function validPropositions(
  pack: DeliberationPack,
  contributions: ReasoningContribution[],
  stage: NonNullable<ReturnType<typeof contributionStage>>,
): DeliberationPack['propositions'] {
  const countedScenes = new Set<string>()
  return contributions.flatMap((item) => {
    if (
      contributionStage(item.sceneId) !== stage ||
      countedScenes.has(item.sceneId) ||
      item.influencePenalty < 0
    ) return []
    const proposition = pack.propositions.find(({ id }) => id === item.propositionId)
    if (
      !proposition ||
      proposition.legalQuestion !== item.legalQuestion ||
      proposition.evidenceId !== item.evidenceId ||
      proposition.move !== item.move
    ) return []
    countedScenes.add(item.sceneId)
    return [proposition]
  })
}

/**
 * Moves at most one authored vote for each lawful evidence-linked contribution.
 * The aggregate is deterministic and individual authored votes are never created
 * or exposed.
 */
export function evolveAuthoredBallot(
  startingBallot: BallotAggregate,
  propositions: DeliberationPack['propositions'],
): BallotAggregate {
  const ballot = cloneBallot(startingBallot)
  assertTotal(ballot, 11)
  for (const proposition of propositions) {
    const { issue, direction, counterVerdict } = proposition.influence
    if (direction === 0) continue
    if (direction === -1) {
      if (counterVerdict && ballot[issue] > 0) {
        ballot[issue] -= 1
        ballot[counterVerdict] += 1
      }
      continue
    }
    if (ballot[issue] >= 11) continue
    const source = verdicts
      .filter((verdict) => verdict !== issue && ballot[verdict] > 0)
      .sort((left, right) => {
        if (left === 'unable-to-agree') return -1
        if (right === 'unable-to-agree') return 1
        return ballot[right] - ballot[left] || verdicts.indexOf(left) - verdicts.indexOf(right)
      })[0]
    if (source) {
      ballot[source] -= 1
      ballot[issue] += 1
    }
  }
  return ballot
}

function addPlayer(ballot: BallotAggregate, vote: Verdict): BallotAggregate {
  const aggregate = cloneBallot(ballot)
  aggregate[vote] += 1
  assertTotal(aggregate, 12)
  return aggregate
}

export function calculateSecondBallot(
  pack: DeliberationPack,
  playerVote: Verdict,
  contributions: ReasoningContribution[],
): BallotAggregate {
  const authored = evolveAuthoredBallot(
    pack.firstBallot,
    validPropositions(pack, contributions, 'pre-second-ballot'),
  )
  return addPlayer(authored, playerVote)
}

export function unanimousVerdict(ballot: BallotAggregate): Verdict | null {
  return verdicts.find((verdict) => verdict !== 'unable-to-agree' && ballot[verdict] === 12) ?? null
}

export function canAuthorizeMajority(
  pack: DeliberationPack,
  input: Pick<FinalBallotInput, 'secondBallotWasUnanimous' | 'majorityDirectionReceived' | 'elapsedCourtHours'>,
  furtherDiscussionCount: number,
): boolean {
  return !input.secondBallotWasUnanimous &&
    input.majorityDirectionReceived &&
    input.elapsedCourtHours > pack.majorityGate.minimumElapsedCourtHours &&
    furtherDiscussionCount > 0
}

export function calculateFinalBallot(input: FinalBallotInput): DeliberationResult {
  const secondAuthored = evolveAuthoredBallot(
    input.pack.firstBallot,
    validPropositions(input.pack, input.contributions, 'pre-second-ballot'),
  )
  const finalAuthored = evolveAuthoredBallot(
    secondAuthored,
    validPropositions(input.pack, input.contributions, 'further-discussion'),
  )
  const aggregate = addPlayer(finalAuthored, input.finalVote)
  const unanimous = unanimousVerdict(aggregate)
  if (unanimous) {
    return { aggregate, verdict: unanimous, agreement: 'unanimous', majorityAuthorized: false }
  }

  const majorityAuthorized = canAuthorizeMajority(
    input.pack,
    input,
    validPropositions(input.pack, input.contributions, 'further-discussion').length,
  )
  if (majorityAuthorized) {
    const majority = verdicts.find((verdict) => (
      verdict !== 'unable-to-agree' && aggregate[verdict] >= input.pack.majorityGate.threshold
    ))
    if (majority) {
      return { aggregate, verdict: majority, agreement: 'majority', majorityAuthorized: true }
    }
  }
  return { aggregate, verdict: 'unable-to-agree', agreement: 'hung', majorityAuthorized }
}

export function outcomeAnalysis(pack: DeliberationPack, verdict: Verdict) {
  const outcome = pack.outcomePaths.find((path) => path.verdict === verdict)
  if (!outcome) throw new Error(`No authored analysis exists for ${verdict}.`)
  return outcome
}

export function analysisForReturnedVerdict(
  pack: DeliberationPack,
  returnedVerdict?: Verdict,
) {
  return returnedVerdict ? outcomeAnalysis(pack, returnedVerdict) : null
}

export function nextSundaySceneId(
  currentSceneId: string,
  secondBallotWasUnanimous: boolean,
): string | null {
  const dividedOrder = [
    'sun-resume', 'sun-negligence', 'sun-second-ballot', 'sun-persevere',
    'sun-majority', 'sun-final-ballot', 'sun-verdict', 'sun-analysis',
  ]
  if (currentSceneId === 'sun-second-ballot' && secondBallotWasUnanimous) {
    return 'sun-verdict'
  }
  const index = dividedOrder.indexOf(currentSceneId)
  return index >= 0 ? dividedOrder[index + 1] ?? null : null
}

export function openCourtReturn(verdict: Verdict, agreement: Agreement): string {
  if (agreement === 'hung') {
    return 'The jury returns. The accused stands. The foreperson says: “We are unable to agree.” The judge discharges the jury without criticism.'
  }
  const spoken = verdict === 'murder'
    ? 'Guilty of murder'
    : verdict === 'manslaughter'
      ? 'Guilty of manslaughter by criminal negligence'
      : 'Not Guilty'
  const basis = agreement === 'majority' ? 'by an authorised eleven-to-one majority' : 'unanimously'
  return `The jury returns. The accused stands. The foreperson says: “${spoken}, ${basis}.” The verdict is recorded in open court.`
}

export function matchImproperArgument(pack: DeliberationPack, claim: string) {
  const normalized = claim.trim().toLocaleLowerCase()
  return pack.improperArguments.find((argument) => argument.claim.toLocaleLowerCase() === normalized) ?? null
}

/**
 * Assesses the proposed basis separately from the lawful reasoning move.
 * Forbidden content is not persisted; only its authored influence penalty is.
 */
export function assessReasoningContribution(
  pack: DeliberationPack,
  draft: ReasoningContributionDraft,
): ReasoningAssessment {
  const { improperClaim, ...lawfulDraft } = draft
  const proposition = pack.propositions.find(({ id }) => id === lawfulDraft.propositionId)
  if (
    !proposition ||
    proposition.legalQuestion !== lawfulDraft.legalQuestion ||
    proposition.evidenceId !== lawfulDraft.evidenceId ||
    proposition.move !== lawfulDraft.move
  ) throw new Error('This reasoning proposition is not part of the reviewed deliberation.')
  const improper = improperClaim ? matchImproperArgument(pack, improperClaim) : null
  return {
    contribution: {
      ...lawfulDraft,
      influencePenalty: improper?.influencePenalty ?? 0,
    },
    correction: improper?.correction ?? null,
  }
}
