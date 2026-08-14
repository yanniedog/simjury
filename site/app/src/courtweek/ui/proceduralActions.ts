import type { CourtEvent, Scene } from '../model/schema'

type InteractionKind = NonNullable<Scene['interaction']>['kind']

const eventActions: Record<CourtEvent, string> = {
  arrival: 'Read the court instructions',
  empanelment: 'Read the empanelment',
  plea: 'Read the arraignment and plea',
  oath: 'Read the oath or affirmation',
  'preliminary-direction': 'Read the judge\'s directions',
  'crown-opening': 'Read the Crown opening',
  'defence-opening-reserved': 'Read the defence response',
  'defence-opening': 'Read the defence opening',
  'witness-chief': 'Read the examination',
  'witness-cross': 'Read the cross-examination',
  'witness-reexamination': 'Read the re-examination',
  'exhibit-admitted': 'Review the next exhibit step',
  objection: 'Read the objection',
  ruling: 'Read the ruling',
  'crown-close': 'Read the Crown close of evidence',
  'silence-direction': 'Read the silence direction',
  'defence-close': 'Read the defence close of evidence',
  'crown-closing': 'Read the Crown address',
  'defence-closing': 'Read the defence address',
  'summing-up': 'Read the judge\'s directions',
  retire: 'Read the retirement direction',
  'provisional-vote': 'Read the provisional-ballot direction',
  'first-ballot': 'Review the ballot aggregate',
  'jury-discussion': 'Read the next juror contribution',
  'jury-note': 'Read the jury note',
  'judge-response': 'Read the judge\'s answer',
  'second-ballot': 'Read the second-ballot direction',
  'perseverance-direction': 'Read the further-deliberation direction',
  'majority-direction': 'Read the majority-verdict direction',
  'final-ballot': 'Read the final-ballot direction',
  'verdict-return': 'Read the open-court return',
  analysis: 'Read the next case analysis',
  adjournment: 'Read the adjournment direction',
}

const interactionOpenActions: Record<InteractionKind, string> = {
  observe: 'Read the next court step',
  'inspect-exhibit': 'Inspect the admitted exhibit',
  'choose-focus': 'Choose your review focus',
  'seal-vote': 'Open the provisional ballot',
  reasoning: 'Add a reasoning contribution',
  'jury-note': 'Review the jury note and answer',
  'second-vote': 'Open the second private ballot',
  'final-vote': 'Open the final private ballot',
}

export function courtEventAction(event: CourtEvent): string {
  return eventActions[event]
}

export function interactionOpenAction(kind: InteractionKind): string {
  return interactionOpenActions[kind]
}

export function interactionPrimaryAction({
  kind,
  replay,
  ballotSealed,
  secondBallotWasUnanimous,
}: {
  kind: InteractionKind
  replay: boolean
  ballotSealed: boolean
  secondBallotWasUnanimous: boolean
}): string {
  if (replay) return 'Resume replay'
  if (kind === 'seal-vote') return ballotSealed ? 'View anonymous aggregate' : 'Seal provisional ballot'
  if (kind === 'second-vote') {
    if (!ballotSealed) return 'Seal second ballot'
    return secondBallotWasUnanimous ? 'Return to court' : 'Return to court for direction'
  }
  if (kind === 'final-vote') return 'Seal final ballot'
  if (kind === 'reasoning') return 'Record reasoning contribution'
  if (kind === 'choose-focus') return 'Confirm review focus'
  if (kind === 'inspect-exhibit') return 'Finish exhibit review'
  if (kind === 'jury-note') return 'Return to deliberation'
  return 'Read the next court step'
}
