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

const firstCrownOpening = 'At 21:16 the accused heard a distress call from beacon AR-71. She repeated that beacon correctly, accepted the incident and had the nearest rescue craft available. Yet she lowered the priority, confirmed that deliberate change and wrote “hold—readiness.” Eleven minutes passed before Kestrel launched. Ilan Saye died before it arrived.'
const writtenHold = '“hold—readiness.”'

/**
 * Inactive, review-only Monday source. Nothing in the active pack graph imports
 * this candidate; a later content-and-media cutover must be separately reviewed.
 */
export const MONDAY_SPEECH_CANDIDATE: readonly MondaySpeechCandidateCue[] = [
  cue('mon-arrival-1', 'arrival', [
    turn('mon-arrival-1__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'Members of the jury panel, switch off every device except the one running this simulation. Do not search the names, science or procedures you hear. This case is wholly fictional, but your obligation is the real obligation of a juror: decide only from evidence admitted in court and the law the judge gives you.'),
  ]),
  cue('mon-arrival-2', 'empanelment', [
    turn('mon-arrival-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You have been selected after each side had the opportunity to raise lawful challenges. Nothing in that process suggests a view about the evidence. If you recognise only a similarity to some other event, put it aside. The people, service, storm and harbour in this trial exist only in the State of Orinth.'),
  ]),
  cue('mon-oath', 'oath', [
    turn('mon-oath__1', 'clerk', 'Clerk', 'live-proceeding', 'none', 'Choose an oath or affirmation. In either form you promise to try the accused faithfully and give a true verdict according to the evidence. The promise has the same force. You are not joining the Crown, the defence or the investigation. You are becoming one of twelve independent judges of fact.'),
  ]),
  cue('mon-plea', 'plea', [
    turn('mon-plea__1', 'clerk', 'Clerk', 'live-proceeding', 'charge-read', 'Mara Venn, you are charged that, while owing an emergency-dispatch duty, you intentionally withheld rescue action and thereby murdered Ilan Saye.'),
    turn('mon-plea__2', 'clerk', 'Clerk', 'live-proceeding', 'plea-question', 'How do you plead?'),
    turn('mon-plea__3', 'accused', 'Mara Venn', 'live-proceeding', 'plea-answer', 'Not guilty.'),
    turn('mon-plea__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'That plea is not evidence. It leaves the Crown to prove every element of the charge and does not require Mara Venn to prove anything.'),
  ]),
  cue('mon-prelim-1', 'preliminary-direction', [
    turn('mon-prelim-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Mara Venn is presumed innocent. She need prove nothing. The Crown bears the burden throughout and must exclude every reasonable possibility consistent with innocence before you may convict. Suspicion, even grave suspicion, is not proof beyond reasonable doubt. Nor does the seriousness of a death reduce the standard.'),
  ]),
  cue('mon-prelim-2', 'preliminary-direction', [
    turn('mon-prelim-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Keep private notes if they help, but notes are aids rather than evidence. Do not decide witness by manner alone. Consider opportunity to observe, consistency, independent support, possible error and whether the account changed under fair testing. Do not discuss the case before retirement, even with another juror.'),
  ]),
  cue('mon-crown-opening-1', 'crown-opening', [
    turn('mon-crown-opening-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', firstCrownOpening, [writtenQuote(firstCrownOpening, writtenHold, 'accused')]),
  ]),
  cue('mon-crown-opening-2', 'crown-opening', [
    turn('mon-crown-opening-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'We say the hold was not a mistake. Saye was a safety auditor preparing a memorandum that could suspend Venn’s certification. You will hear the recording, see the authenticated console actions and learn why eleven minutes mattered medically. The Crown must still prove knowledge, causation and murderous intent; an ugly consequence alone will not do.'),
  ]),
  cue('mon-def-reserve', 'defence-opening-reserved', [
    turn('mon-def-reserve__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'We reserve our opening until the Crown has called all its evidence. That is a procedural choice, not evidence and not a sign of weakness. We ask you to hold the Crown to what its witnesses actually establish, rather than fill the silent spaces in its opening.'),
  ]),
  cue('mon-orr-chief-1', 'witness-chief', [
    turn('mon-orr-chief-1__1', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'I supervise the duty controllers. When a controller accepts a credible distress alert, section 41 requires reasonable dispatch steps unless a greater imminent peril is reasonably prioritised. At 21:16 Venn was the controller. Dorn was the junior dispatcher. Kestrel at North Station was the nearest rescue craft to AR-71.'),
  ]),
  cue('mon-orr-chief-2', 'exhibit-admitted', [
    turn('mon-orr-chief-2__1', 'nella-orr', 'Nella Orr', 'live-proceeding', 'foundation', 'This route diagram accurately marks the stations, beacon and ordinary path. North Station is eleven nautical miles from AR-71. It does not show that night’s visibility, waves, survival conditions, other incidents or craft assignments.'),
    turn('mon-orr-chief-2__2', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the route diagram.'),
    turn('mon-orr-chief-2__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The route diagram is admitted.'),
    turn('mon-orr-chief-2__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Use it only for the marked stations, beacon, distance and ordinary path. It does not prove conditions, other incidents or craft assignments that night.'),
  ]),
  cue('mon-orr-cross-1', 'witness-cross', [
    turn('mon-orr-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Section 41 does not command instant launch on every call, does it?'),
    turn('mon-orr-cross-1__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'No. A controller may reasonably prioritise a greater imminent peril and must consider craft safety.'),
    turn('mon-orr-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'During a severe storm, choosing among incomplete reports is part of the job?'),
    turn('mon-orr-cross-1__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Yes, but the choice still must be reasonable.'),
  ]),
  cue('mon-orr-cross-2', 'witness-cross', [
    turn('mon-orr-cross-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'READY is not the same as perfect condition?'),
    turn('mon-orr-cross-2__2', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'Correct. It means crewed and launch-capable under the status protocol. Separate warnings may require attention.'),
    turn('mon-orr-cross-2__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'And you were not beside Venn when she made the decision?'),
    turn('mon-orr-cross-2__4', 'nella-orr', 'Nella Orr', 'live-proceeding', 'answer', 'I was in another room. I cannot say what she believed.'),
  ]),
  cue('mon-elements-1', 'preliminary-direction', [
    turn('mon-elements-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Do not decide the case tonight. It is agreed that Venn accepted AR-71 as a credible distress alert at 21:16:08. Organise what you hear around the live questions. Did she intentionally withhold a reasonable dispatch step without reasonably prioritising a greater peril? Did that omission cause death? For murder only: did she then intend death or really serious injury?'),
  ]),
  cue('mon-elements-2', 'preliminary-direction', [
    turn('mon-elements-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'An intentional act is not automatically a murderous intent. Pressing a button deliberately may prove the action was conscious; it does not by itself prove what consequence was intended. Equally, intention may be inferred from circumstances, but only if the inference is the sole reasonable conclusion from the evidence as a whole.'),
  ]),
  cue('mon-adjourn-1', 'adjournment', [
    turn('mon-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The Crown’s opening is not evidence. Orr’s evidence and the route diagram are evidence, subject to the limits you heard. Between sittings, do not research emergency law, weather, rescue craft, hypothermia or any supposed real analogue. Do not let another person inspect your juror notes.'),
  ]),
  cue('mon-adjourn-2', 'adjournment', [
    turn('mon-adjourn-2__1', 'narrator', 'Narrator', 'narration', 'narration', 'Your progress is saved on this device. The court will resume with the junior dispatcher and the authenticated distress recording. Until then, no conclusion is required of you. The discipline of postponing judgment is part of the task.'),
  ]),
]
