import type { CourtEvent, Scene } from '../model/schema'

type InteractionKind = NonNullable<Scene['interaction']>['kind']

export const DEFAULT_ADVANCE_ACTION = 'Read the next court step'

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
  'fresh-unanimity-ballot': 'Read the fresh-unanimity-ballot direction',
  'majority-direction': 'Read the majority-verdict direction',
  'final-ballot': 'Read the final-ballot direction',
  'verdict-return': 'Read the open-court return',
  analysis: 'Read the next case analysis',
  adjournment: 'Read the adjournment direction',
}

const interactionOpenActions: Record<InteractionKind, string> = {
  observe: DEFAULT_ADVANCE_ACTION,
  'inspect-exhibit': 'Inspect the admitted exhibit',
  'choose-focus': 'Choose your review focus',
  'seal-vote': 'Open the provisional ballot',
  reasoning: 'Add a reasoning contribution',
  'jury-note': 'Review the jury note and answer',
  'second-vote': 'Open the second private ballot',
  'fresh-unanimity-vote': 'Open the fresh private unanimity ballot',
  'final-vote': 'Open the final private ballot',
}

export function courtEventAction(event: CourtEvent): string {
  return eventActions[event]
}

function isOathChoice(kind: InteractionKind, prompt: string): boolean {
  return kind === 'choose-focus' && /\boath or affirmation\b/iu.test(prompt)
}

export function interactionOpenAction({
  kind,
  prompt,
  replay,
}: {
  kind: InteractionKind
  prompt: string
  replay: boolean
}): string {
  if (replay) return 'Review this interaction'
  if (isOathChoice(kind, prompt)) return 'Choose oath or affirmation'
  return interactionOpenActions[kind]
}

export function courtAdvanceAction({
  targetEvent,
  interaction,
  nextEvent,
  replay,
  sessionEndAction,
}: {
  targetEvent?: CourtEvent
  interaction?: Scene['interaction']
  nextEvent?: CourtEvent
  replay: boolean
  sessionEndAction: string
}): string {
  if (targetEvent) return courtEventAction(targetEvent)
  if (interaction && interaction.kind !== 'observe') {
    return interactionOpenAction({ kind: interaction.kind, prompt: interaction.prompt, replay })
  }
  if (nextEvent) return courtEventAction(nextEvent)
  return replay ? 'End replay' : sessionEndAction
}

export function interactionPrimaryAction({
  kind,
  replay,
  replayEnds,
  ballotSealed,
  secondBallotWasUnanimous,
  freshBallotWasUnanimous,
  prompt,
  recordsReasoning,
}: {
  kind: InteractionKind
  replay: boolean
  replayEnds: boolean
  ballotSealed: boolean
  secondBallotWasUnanimous: boolean
  freshBallotWasUnanimous: boolean
  prompt: string
  recordsReasoning: boolean
}): string {
  if (replay) return replayEnds ? 'End replay' : 'Resume replay'
  switch (kind) {
    case 'observe': return DEFAULT_ADVANCE_ACTION
    case 'seal-vote': return ballotSealed ? 'Continue toward the anonymous aggregate' : 'Seal provisional ballot'
    case 'second-vote':
      if (!ballotSealed) return 'Seal second ballot'
      return secondBallotWasUnanimous ? 'Return to court' : 'Return to court for direction'
    case 'fresh-unanimity-vote':
      if (!ballotSealed) return 'Seal fresh unanimity ballot'
      return freshBallotWasUnanimous ? 'Return to court' : 'Report no unanimous verdict'
    case 'final-vote': return 'Seal final ballot'
    case 'reasoning': return recordsReasoning
      ? 'Record reasoning contribution'
      : 'Continue without saving reflection'
    case 'choose-focus': return isOathChoice(kind, prompt)
      ? 'Confirm oath or affirmation'
      : 'Confirm review focus'
    case 'inspect-exhibit': return 'Finish exhibit review'
    case 'jury-note': return 'Return to court for overnight separation'
  }
}
