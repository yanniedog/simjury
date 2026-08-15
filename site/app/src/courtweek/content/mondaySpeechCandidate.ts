import type { CourtEvent } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  QuotedSpan,
  ReviewedSpeechCue,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const MONDAY_SOURCE_CUE_IDS = [
  'mon-arrival-1',
  'mon-arrival-2',
  'mon-oath',
  'mon-plea',
  'mon-prelim-1',
  'mon-prelim-2',
  'mon-crown-opening-1',
  'mon-crown-opening-2',
  'mon-def-reserve',
  'mon-orr-chief-1',
  'mon-orr-chief-2',
  'mon-orr-cross-1',
  'mon-orr-cross-2',
  'mon-elements-1',
  'mon-elements-2',
  'mon-adjourn-1',
  'mon-adjourn-2',
] as const

export type MondaySourceCueId = typeof MONDAY_SOURCE_CUE_IDS[number]

export interface MondaySpeechCandidateCue extends ReviewedSpeechCue {
  id: MondaySourceCueId
  sourceCueId: MondaySourceCueId
  event: CourtEvent
}

function turn(
  id: string,
  actorId: ActorId,
  displayLabel: string,
  speechMode: SpeechMode,
  legalAction: LegalAction,
  text: string,
  quotedSpans?: readonly QuotedSpan[],
): SpokenTurn {
  return { id, actorId, displayLabel, speechMode, legalAction, text, ...(quotedSpans ? { quotedSpans } : {}) }
}

function cue(
  sourceCueId: MondaySourceCueId,
  event: CourtEvent,
  turns: readonly SpokenTurn[],
): MondaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, turns, sourceText: turns.map(({ text }) => text).join(' ') }
}

function writtenQuote(text: string, excerpt: string, sourceActorId: ActorId): QuotedSpan {
  const start = text.indexOf(excerpt)
  if (start < 0) throw new Error(`Missing reviewed written quotation: ${excerpt}`)
  if (start !== text.lastIndexOf(excerpt)) throw new Error(`Ambiguous reviewed written quotation: ${excerpt}`)
  return { start, end: start + excerpt.length, source: 'written', sourceActorId }
}

const firstCrownOpening = 'At twenty-one sixteen, the accused heard a distress call from beacon A R seventy-one. She repeated the beacon correctly, accepted the incident and had the nearest rescue craft available. She then lowered the priority, confirmed that change and made the written entry “hold, readiness.” Eleven minutes passed before Kestrel launched. Ilan Saye died before it arrived.'
const writtenHold = '“hold, readiness.”'

/**
 * Inactive, review-only Monday source. Nothing in the active pack graph imports
 * this candidate; a later content-and-media cutover must be separately reviewed.
 */
export const MONDAY_SPEECH_CANDIDATE: readonly MondaySpeechCandidateCue[] = [
  cue('mon-arrival-1', 'arrival', [
    turn('mon-arrival-1__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'Members of the panel, please switch off every device except the one running this simulation. Do not search the names, science or procedures you hear. This case is wholly fictional. If you are empanelled, your task will be to decide it only on the evidence admitted in court and the law the judge gives you.'),
  ]),
  cue('mon-arrival-2', 'empanelment', [
    turn('mon-arrival-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You have now been empanelled. Each side had an opportunity to raise lawful challenges. Nothing in that process suggests any view about the evidence. If something in this case reminds you of a real event, put that resemblance aside. The people, service, storm and harbour in this trial are fictional and exist only in the State of Calder.'),
  ]),
  cue('mon-oath', 'oath', [
    turn('mon-oath__1', 'clerk', 'Clerk', 'live-proceeding', 'none', 'Each juror may take an oath or make an affirmation. They have the same force. In either form, you promise to try the accused faithfully and return a true verdict according to the evidence. You do not join the Crown, the defence or the investigation. You remain an independent judge of the facts.'),
  ]),
  cue('mon-plea', 'plea', [
    turn('mon-plea__1', 'clerk', 'Clerk', 'live-proceeding', 'charge-read', 'Mara Venn, you are charged with the murder of Ilan Saye. The Crown alleges that, while under a duty to dispatch emergency assistance, you intentionally withheld rescue action and caused his death.'),
    turn('mon-plea__2', 'clerk', 'Clerk', 'live-proceeding', 'plea-question', 'How do you plead?'),
    turn('mon-plea__3', 'accused', 'Mara Venn', 'live-proceeding', 'plea-answer', 'Not guilty.'),
    turn('mon-plea__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'That plea is not evidence. It leaves the Crown to prove every element of the charge and does not require Mara Venn to prove anything.'),
  ]),
  cue('mon-prelim-1', 'preliminary-direction', [
    turn('mon-prelim-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Mara Venn is presumed innocent. She is not required to prove anything. The Crown bears the burden throughout and must exclude every reasonable possibility consistent with innocence before you may convict. Suspicion, even strong suspicion, is not proof beyond reasonable doubt. The seriousness of the charge cannot reduce that standard.'),
  ]),
  cue('mon-prelim-2', 'preliminary-direction', [
    turn('mon-prelim-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Keep private notes if they help, but remember that notes are only an aid and are not evidence. Do not judge a witness by manner alone. Consider the witness’s opportunity to observe, the consistency of the account, any independent support, the possibility of mistake and how the account responds to fair testing. Do not discuss the case before retirement, even with another juror.'),
  ]),
  cue('mon-crown-opening-1', 'crown-opening', [
    turn('mon-crown-opening-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', firstCrownOpening, [writtenQuote(firstCrownOpening, writtenHold, 'accused')]),
  ]),
  cue('mon-crown-opening-2', 'crown-opening', [
    turn('mon-crown-opening-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'We say the hold was not a mistake. Saye was a safety auditor preparing a memorandum that could suspend Venn’s certification. You will hear the recording, see the authenticated console actions and learn why eleven minutes mattered medically. The Crown must still prove knowledge, causation and the intention required for murder. A grave consequence alone is not enough.'),
  ]),
  cue('mon-def-reserve', 'defence-opening-reserved', [
    turn('mon-def-reserve__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Your Honour, the defence will reserve its opening until the Crown case is complete.'),
    turn('mon-def-reserve__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'That is an ordinary procedural choice. It is not evidence and says nothing about the strength of either case. For now, consider only what the Crown witnesses actually establish.'),
  ]),
  cue('mon-orr-chief-1', 'witness-chief', [
    turn('mon-orr-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What is your role?'),
    turn('mon-orr-chief-1__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'I supervise the duty controllers.'),
    turn('mon-orr-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What operating procedure did your service follow after a controller accepted a credible distress alert?'),
    turn('mon-orr-chief-1__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'The controller was to take reasonable dispatch steps unless they reasonably gave priority to a greater imminent peril.'),
    turn('mon-orr-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Who was on duty at twenty-one sixteen, and which rescue craft was closest to the beacon?'),
    turn('mon-orr-chief-1__6', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Mara Venn was the controller and Peli Dorn was the junior dispatcher. Kestrel, at North Station, was the nearest rescue craft to beacon A R seventy-one.'),
  ]),
  cue('mon-orr-chief-2', 'exhibit-admitted', [
    turn('mon-orr-chief-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise this route diagram?'),
    turn('mon-orr-chief-2__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'foundation', 'Yes. It accurately marks the stations, beacon A R seventy-one and the ordinary route. North Station is eleven nautical miles from the beacon.'),
    turn('mon-orr-chief-2__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What does the diagram not show?'),
    turn('mon-orr-chief-2__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'It does not show that night’s visibility, waves, survival conditions, other incidents or craft assignments.'),
    turn('mon-orr-chief-2__5', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the route diagram.'),
    turn('mon-orr-chief-2__6', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The route diagram is admitted.'),
    turn('mon-orr-chief-2__7', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Use it only for the marked stations, beacon, distance and ordinary route. It does not prove the conditions, other incidents or craft assignments that night.'),
  ]),
  cue('mon-orr-cross-1', 'witness-cross', [
    turn('mon-orr-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Under that procedure, a controller could delay a launch when a greater imminent peril was reasonably given priority?'),
    turn('mon-orr-cross-1__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Yes. A controller may reasonably give priority to a greater imminent peril and must consider craft safety.'),
    turn('mon-orr-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'During a severe storm, choosing among incomplete reports is part of the job?'),
    turn('mon-orr-cross-1__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Yes, but the choice still must be reasonable.'),
  ]),
  cue('mon-orr-cross-2', 'witness-cross', [
    turn('mon-orr-cross-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'When the system showed ready, that did not mean the craft was in perfect condition?'),
    turn('mon-orr-cross-2__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Correct. It meant the craft was crewed and capable of launching under the status protocol. A separate warning could still require attention.'),
    turn('mon-orr-cross-2__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'You were not beside Mara Venn when she made the decision?'),
    turn('mon-orr-cross-2__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'I was in another room. I cannot say what she believed.'),
  ]),
  cue('mon-elements-1', 'preliminary-direction', [
    turn('mon-elements-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Do not decide the case tonight. It is agreed that Mara Venn accepted beacon A R seventy-one as a credible distress alert at twenty-one sixteen and eight seconds. Organise what you hear around the questions that remain. Did she intentionally withhold a reasonable dispatch step without reasonably giving priority to a greater imminent peril? Did that omission cause death? For murder, did she intend to cause death or really serious injury?'),
  ]),
  cue('mon-elements-2', 'preliminary-direction', [
    turn('mon-elements-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'A deliberate act does not by itself prove an intention to kill or cause really serious injury. Deliberately pressing a button may prove that the action was conscious, but it does not by itself prove what consequence was intended. You may infer intention from the circumstances only if it is the sole reasonable conclusion from the evidence as a whole.'),
  ]),
  cue('mon-adjourn-1', 'adjournment', [
    turn('mon-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The Crown’s opening is not evidence. Orr’s evidence and the route diagram are evidence, subject to the limits you heard. Between sittings, do not research emergency law, weather, rescue craft, hypothermia or any supposed real analogue. Do not let another person inspect your juror notes.'),
  ]),
  cue('mon-adjourn-2', 'adjournment', [
    turn('mon-adjourn-2__1', 'narrator', 'Narrator', 'narration', 'narration', 'Your progress is saved on this device. The court will resume with the junior dispatcher and the authenticated distress recording. Until then, no conclusion is required of you. The discipline of postponing judgment is part of the task.'),
  ]),
]
