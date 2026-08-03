import type {
  DeliberationPack,
  ReasoningContribution,
  Verdict,
} from '../model/schema'

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

function validContributionCount(contributions: ReasoningContribution[]): number {
  return contributions.filter((item) => (
    item.legalQuestion.trim().length > 0 &&
    item.evidenceId.trim().length > 0 &&
    item.influencePenalty >= 0
  )).length
}

/**
 * Moves at most one authored vote for each lawful evidence-linked contribution.
 * The aggregate is deterministic and individual authored votes are never created
 * or exposed.
 */
export function evolveAuthoredBallot(
  startingBallot: BallotAggregate,
  target: Verdict,
  lawfulSteps: number,
): BallotAggregate {
  const ballot = cloneBallot(startingBallot)
  assertTotal(ballot, 11)
  if (target === 'unable-to-agree') return ballot

  for (let step = 0; step < lawfulSteps && ballot[target] < 11; step += 1) {
    const source = verdicts
      .filter((verdict) => verdict !== target && ballot[verdict] > 0)
      .sort((left, right) => {
        if (left === 'unable-to-agree') return -1
        if (right === 'unable-to-agree') return 1
        return ballot[right] - ballot[left] || verdicts.indexOf(left) - verdicts.indexOf(right)
      })[0]
    if (!source) break
    ballot[source] -= 1
    ballot[target] += 1
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
    playerVote,
    validContributionCount(contributions),
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
  const secondContributions = input.contributions.filter((item) => item.sceneId !== 'sun-persevere')
  const furtherContributions = input.contributions.filter((item) => item.sceneId === 'sun-persevere')
  const secondAuthored = evolveAuthoredBallot(
    input.pack.firstBallot,
    input.secondVote,
    validContributionCount(secondContributions),
  )
  const finalAuthored = evolveAuthoredBallot(
    secondAuthored,
    input.finalVote,
    validContributionCount(furtherContributions),
  )
  const aggregate = addPlayer(finalAuthored, input.finalVote)
  const unanimous = unanimousVerdict(aggregate)
  if (unanimous) {
    return { aggregate, verdict: unanimous, agreement: 'unanimous', majorityAuthorized: false }
  }

  const majorityAuthorized = canAuthorizeMajority(
    input.pack,
    input,
    validContributionCount(furtherContributions),
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
