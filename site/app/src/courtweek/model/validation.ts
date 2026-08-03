import { type CourtEvent, type CourtWeek, courtWeekSchema } from './schema'

export type LegalState = {
  sworn: boolean
  crownOpened: boolean
  crownClosed: boolean
  defenceOpened: boolean
  defenceClosed: boolean
  addressesComplete: boolean
  summedUp: boolean
  retired: boolean
  provisionalVoteSealed: boolean
  firstBallotTaken: boolean
  verdictReturned: boolean
}

export const initialLegalState: LegalState = {
  sworn: false,
  crownOpened: false,
  crownClosed: false,
  defenceOpened: false,
  defenceClosed: false,
  addressesComplete: false,
  summedUp: false,
  retired: false,
  provisionalVoteSealed: false,
  firstBallotTaken: false,
  verdictReturned: false,
}

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length

/** Conservative proxy until release audio durations replace it: 141 wpm plus natural pauses. */
export function estimateCueSeconds(text: string): number {
  const spoken = words(text) / 2.35
  const pauses = (text.match(/[.!?;:—]/gu) ?? []).length * 0.18
  return Math.ceil(Math.max(3, spoken + pauses))
}

export function estimateSessionSeconds(session: CourtWeek['manifest']['sessions'][number]): number {
  return session.scenes.reduce((total, scene) => total
    + scene.transitionSeconds
    + (scene.interaction?.minimumSeconds ?? 0)
    + scene.cues.reduce((cueTotal, cue) => cueTotal + estimateCueSeconds(cue.text), 0), 0)
}

function demand(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function transitionLegalState(state: LegalState, event: CourtEvent): LegalState {
  const next = { ...state }
  switch (event) {
    case 'oath':
      next.sworn = true
      break
    case 'crown-opening':
      demand(state.sworn, 'the Crown cannot open before the jury is sworn')
      next.crownOpened = true
      break
    case 'witness-chief':
    case 'witness-cross':
    case 'witness-reexamination':
    case 'exhibit-admitted':
      demand(state.sworn && state.crownOpened, 'evidence cannot be received before oath and Crown opening')
      demand(!state.defenceClosed, 'evidence cannot resume after the defence closes')
      break
    case 'crown-close':
      demand(state.crownOpened && !state.defenceOpened, 'the Crown must finish its continuous case before the defence opens')
      next.crownClosed = true
      break
    case 'defence-opening':
      demand(state.crownClosed, 'the defence cannot open before Crown closure')
      next.defenceOpened = true
      break
    case 'silence-direction':
      demand(state.crownClosed, 'the silence direction belongs after the Crown case')
      break
    case 'defence-close':
      demand(state.crownClosed && state.defenceOpened, 'the defence cannot close before opening')
      next.defenceClosed = true
      break
    case 'crown-closing':
      demand(state.defenceClosed, 'the Crown address follows the close of evidence')
      break
    case 'defence-closing':
      demand(state.defenceClosed, 'the defence address follows the close of evidence')
      next.addressesComplete = true
      break
    case 'summing-up':
      demand(state.addressesComplete, 'the judge sums up only after both addresses')
      next.summedUp = true
      break
    case 'retire':
      demand(state.summedUp, 'the jury retires only after the summing-up')
      next.retired = true
      break
    case 'provisional-vote':
      demand(state.retired, 'no juror votes before retirement')
      next.provisionalVoteSealed = true
      break
    case 'first-ballot':
      demand(state.provisionalVoteSealed, 'the player must seal a vote before seeing the aggregate ballot')
      next.firstBallotTaken = true
      break
    case 'jury-note':
    case 'second-ballot':
    case 'perseverance-direction':
    case 'majority-direction':
    case 'final-ballot':
      demand(state.firstBallotTaken, `${event} requires a completed first ballot`)
      break
    case 'verdict-return':
      demand(state.firstBallotTaken, 'a verdict cannot be returned before deliberation')
      next.verdictReturned = true
      break
    case 'analysis':
      demand(state.verdictReturned, 'analysis stays sealed until the open-court verdict')
      break
    default:
      break
  }
  return next
}

export type CourtWeekValidation = { durationSeconds: Record<string, number> }

export function validateCourtWeek(input: unknown): CourtWeekValidation {
  const courtWeek = courtWeekSchema.parse(input)
  const sessions = courtWeek.manifest.sessions
  const allCues = sessions.flatMap((session) => session.scenes.flatMap((scene) => scene.cues))
  const cueIds = allCues.map((cue) => cue.id)
  demand(new Set(cueIds).size === cueIds.length, 'cue ids must be unique across the week')

  const expectedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const durations: Record<string, number> = {}
  sessions.forEach((session, index) => {
    demand(session.ordinal === index + 1, `session ${session.id} has the wrong ordinal`)
    demand(session.day === expectedDays[index], `session ${session.id} is not the expected weekday`)
    const expectedPrerequisites = index === 0 ? [] : [sessions[index - 1].id]
    demand(JSON.stringify(session.prerequisiteSessionIds) === JSON.stringify(expectedPrerequisites), `${session.id} must depend only on the preceding session`)
    const seconds = estimateSessionSeconds(session)
    demand(seconds >= 18 * 60 && seconds <= 22 * 60, `${session.id} computes to ${seconds}s; expected 1080..1320s`)
    durations[session.id] = seconds
    if (index > 0) demand(Date.parse(session.unlockAt) > Date.parse(sessions[index - 1].unlockAt), 'unlock times must increase')
  })

  const evidenceIds = courtWeek.trial.evidence.map((evidence) => evidence.id)
  demand(new Set(evidenceIds).size === evidenceIds.length, 'evidence ids must be unique')
  allCues.forEach((cue) => cue.evidenceIds.forEach((id) => {
    const item = courtWeek.trial.evidence.find((evidence) => evidence.id === id)
    demand(Boolean(item), `cue ${cue.id} cites unknown evidence ${id}`)
    demand(item?.status === 'admitted', `cue ${cue.id} cannot cite struck evidence ${id}`)
  }))

  const cueIndex = new Map(cueIds.map((id, index) => [id, index]))
  courtWeek.trial.witnesses.forEach((witness) => {
    const chiefEnd = Math.max(...witness.chiefCueIds.map((id) => cueIndex.get(id) ?? -1))
    const crossStart = Math.min(...witness.crossCueIds.map((id) => cueIndex.get(id) ?? Number.MAX_SAFE_INTEGER))
    demand(chiefEnd >= 0 && crossStart < Number.MAX_SAFE_INTEGER && chiefEnd < crossStart, `${witness.name}: chief must precede cross`)
    witness.reexaminationCueIds.forEach((id) => demand((cueIndex.get(id) ?? -1) > crossStart, `${witness.name}: re-examination must follow cross`))
    demand(witness.reexaminationCueIds.length === 0 || witness.reexaminationScope.length > 0, `${witness.name}: re-examination needs a confined scope`)
  })

  const objections = courtWeek.trial.objections
  demand(objections.some((o) => o.madeBy === 'Defence' && o.ruling === 'overruled'), 'one defence objection must be overruled')
  demand(objections.some((o) => o.madeBy === 'Crown'), 'the Crown must make an objection')
  demand(objections.some((o) => o.timing === 'pre-answer' && o.ruling === 'sustained'), 'one pre-answer objection must be sustained')
  const postAnswerStrikes = objections.filter((o) => o.timing === 'post-answer' && o.ruling === 'sustained' && o.struckEvidenceId)
  demand(postAnswerStrikes.length === 1, 'there must be exactly one credible post-answer strike')
  const struckItems = courtWeek.trial.evidence.filter((evidence) => evidence.status === 'struck')
  demand(struckItems.length === 1 && struckItems[0].id === postAnswerStrikes[0].struckEvidenceId, 'the single struck item must match the post-answer ruling')
  demand(!struckItems[0].replayable, 'struck material must never be replayable')

  let legalState = initialLegalState
  allCues.forEach((cue) => { legalState = transitionLegalState(legalState, cue.event) })
  demand(legalState.verdictReturned, 'the week must reach an open-court verdict return')

  const ordered = (events: CourtEvent[]) => events.map((event) => {
    const index = allCues.findIndex((cue) => cue.event === event)
    demand(index >= 0, `required event ${event} is absent`)
    return index
  })
  const procedure = ordered(['oath', 'crown-opening', 'crown-close', 'defence-opening', 'defence-close', 'crown-closing', 'defence-closing', 'summing-up', 'retire', 'provisional-vote', 'first-ballot', 'jury-note', 'judge-response', 'second-ballot', 'majority-direction', 'final-ballot', 'verdict-return', 'analysis'])
  demand(procedure.every((value, index) => index === 0 || value > procedure[index - 1]), 'required procedural events are out of order')

  demand(courtWeek.deliberation.outcomePaths.map((path) => path.verdict).join('|') === 'murder|manslaughter|not-guilty|unable-to-agree', 'all four outcomes must be defined in neutral order')
  demand(courtWeek.deliberation.majorityGate.minimumElapsedCourtHours > 8, 'majority consideration must wait more than eight court hours')
  return { durationSeconds: durations }
}

export function assertCourtWeek(input: unknown): asserts input is CourtWeek {
  validateCourtWeek(input)
}
