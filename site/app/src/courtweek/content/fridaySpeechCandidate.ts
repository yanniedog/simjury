import type { CourtEvent } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  QuotedSpan,
  ReviewedSpeechCue,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const FRIDAY_SOURCE_CUE_IDS = [
  'fri-submissions-1', 'fri-submissions-2', 'fri-crown-closing-1',
  'fri-crown-closing-2', 'fri-defence-closing-1', 'fri-defence-closing-2',
  'fri-summing-burden', 'fri-summing-circumstantial', 'fri-summing-duty',
  'fri-summing-causation', 'fri-summing-intent', 'fri-summing-manslaughter',
  'fri-summing-no-compromise', 'fri-summing-expert', 'fri-summing-motive',
  'fri-summing-exhibits', 'fri-retire-direction', 'fri-retire', 'fri-adjourn',
] as const

export type FridaySourceCueId = typeof FRIDAY_SOURCE_CUE_IDS[number]
export type FridayProcedureStage =
  | 'jury-absent-submissions' | 'jury-recall' | 'crown-address' | 'defence-address'
  | 'summing-up' | 'retirement-direction' | 'retirement' | 'overnight-adjournment'

export interface FridaySpeechCandidateCue extends ReviewedSpeechCue {
  id: FridaySourceCueId
  sourceCueId: FridaySourceCueId
  event: CourtEvent
  procedureStage: FridayProcedureStage
}

type QuoteSpec = readonly [excerpt: string, source: QuotedSpan['source'], sourceActorId?: ActorId]

function turn(
  id: string, actorId: ActorId, displayLabel: string, speechMode: SpeechMode,
  legalAction: LegalAction, text: string, quoteSpecs: readonly QuoteSpec[] = [],
): SpokenTurn {
  const quotedSpans = quoteSpecs.map(([excerpt, source, sourceActorId]) => {
    const start = text.indexOf(excerpt)
    if (start < 0) throw new Error(id + ': missing reviewed quotation ' + excerpt)
    if (start !== text.lastIndexOf(excerpt)) throw new Error(id + ': ambiguous reviewed quotation ' + excerpt)
    return { start, end: start + excerpt.length, source, ...(sourceActorId ? { sourceActorId } : {}) }
  })
  return { id, actorId, displayLabel, speechMode, legalAction, text, ...(quotedSpans.length ? { quotedSpans } : {}) }
}

function cue(
  sourceCueId: FridaySourceCueId, event: CourtEvent, procedureStage: FridayProcedureStage,
  turns: readonly SpokenTurn[],
): FridaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, procedureStage, turns, sourceText: turns.map(({ text }) => text).join(' ') }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const FRIDAY_SPEECH_CANDIDATE: readonly FridaySpeechCandidateCue[] = [
  cue('fri-submissions-1', 'adjournment', 'jury-absent-submissions', [
    turn('fri-submissions-1__1', 'narrator', 'Narrator', 'narration', 'narration', 'The jury waits outside while legal argument takes place beyond its hearing. You do not hear what counsel says there. Nothing from that argument becomes evidence before you, and the waiting time tells you nothing about either case.'),
  ]),
  cue('fri-submissions-2', 'adjournment', 'jury-recall', [
    turn('fri-submissions-2__1', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'Members of the jury, please return to court.'),
    turn('fri-submissions-2__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Counsel will address you, and I will then give you the law in open court. Decide the case only on the evidence admitted in your presence and the directions I give you. Do not speculate about what occurred while you were outside.'),
  ]),
  cue('fri-crown-closing-1', 'crown-closing', 'crown-address', [
    turn('fri-crown-closing-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'I ask you to reason from the combined circumstances, not one dramatic phrase. Mara Venn heard and repeated A R seventy-one. The system recorded acceptance, downgrade and confirmation under her authenticated account. Her answer singled it out: “No. Seventy-one waits.” Another craft was already handling the greater visible peril. Kestrel’s status showed ready, clarification was available, no diagnostic required eleven minutes, and the craft later launched with the warning unchanged.', [['“No. Seventy-one waits.”', 'reported', 'accused']]),
  ]),
  cue('fri-crown-closing-2', 'crown-closing', 'crown-address', [
    turn('fri-crown-closing-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'Why hold this incident? Oren Vale reported Mara Venn asking whether “Ilan was trying to end my career.” I submit that her question may supply a motive, but motive alone proves nothing. The unfinished memorandum had not been sent to her and cannot establish that she knew its contents or any recommendation it might contain. I submit that the note, the actions recorded under Mara Venn’s authenticated account and the eleven-minute hold support an intention to cause death or really serious injury. Doctor Eren Vos did not say that Mara Venn knew when a survival window would close. His opinion was that, on the facts and assumptions he accepted, dispatch at twenty-one sixteen would probably have placed recovery inside a medically significant survival window, while dispatch at twenty-one twenty-seven probably placed it outside. I submit that this evidence, with the timing evidence, proves that withholding dispatch materially accelerated death. If murderous intent is not proved, consider manslaughter separately, never as a compromise. I submit that deliberately withholding reasonable dispatch steps, despite the accepted distress duty, available clarification and a launch-capable craft, caused death and fell so far below reasonable care, with so high a risk of death or serious injury, that it merits criminal punishment.', [['“Ilan was trying to end my career.”', 'reported', 'accused']]),
  ]),
  cue('fri-defence-closing-1', 'defence-closing', 'defence-address', [
    turn('fri-defence-closing-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Do not let the death rewrite the decision as it appeared at twenty-one sixteen. The room was saturated, the status word ready did not show the genuine warning, and even Peli Dorn asked which rescue the hold concerned. Tali Rusk described a recognised error mechanism without pretending to read Mara Venn’s mind. Sera Quill confirmed that the safety risk was real. A bad decision may be deliberate without being made with an intention to cause death or really serious injury.'),
  ]),
  cue('fri-defence-closing-2', 'defence-closing', 'defence-address', [
    turn('fri-defence-closing-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Causation remains uncertain. Doctor Eren Vos assumed the ordinary route, an immersion range and no steering interruption. At the pessimistic end of his model, timely dispatch may still have been too late. If a reasonable possibility remains on the evidence that timely dispatch would not have prevented or materially postponed death, causation is not proved. Manslaughter is not a compromise for doubts about murder. Even if you find a deliberate duty breach, the Crown must also prove causation and a departure from reasonable care so great, with so high a risk of death or serious injury, that it merits criminal punishment. The genuine warning, overloaded room, ambiguous ready status and available safety advice bear on whether the Crown proved an unlawful duty breach and, for murder, an intention to cause death or really serious injury. If a reasonable possibility remains that the hold was reasonable safety prioritisation, the duty breach is not proved. If a reasonable possibility remains that the hold resulted from error rather than an intention to cause death or really serious injury, murderous intent is not proved. Mara Venn need not explain the eleven minutes. The Crown must prove each element beyond reasonable doubt.'),
  ]),
  cue('fri-summing-burden', 'summing-up', 'summing-up', [
    turn('fri-summing-burden__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Counsel’s addresses are submissions, not evidence. Where their recollection differs from yours, your honest recollection governs. Venn remains presumed innocent. She has not testified and that fact may not be used against her in any way. The Crown must prove every required fact beyond reasonable doubt; Venn need not prove accident, error, safety concern or any other possibility.'),
  ]),
  cue('fri-summing-circumstantial', 'summing-up', 'summing-up', [
    turn('fri-summing-circumstantial__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The Crown relies substantially on circumstantial reasoning. You may combine circumstances, but guilt must be the only reasonable conclusion available from the proved facts. An alternative is not reasonable merely because imagination can state it; nor may you reject an evidence-based alternative because it is inconvenient or not proved by the defence.'),
  ]),
  cue('fri-summing-duty', 'summing-up', 'summing-up', [
    turn('fri-summing-duty__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Consider murder first. It is agreed that, at twenty-one sixteen and eight seconds, the system recorded A R seventy-one as a credible distress alert accepted under Mara Venn’s authenticated account, and that section forty-one then imposed the accepted alert duty. Your first question is whether the Crown has proved that Mara Venn intentionally failed to take a reasonable dispatch step, without reasonably prioritising a greater imminent peril. A conscious hold is not enough if the Crown leaves a reasonable possibility that it was reasonable safety prioritisation.'),
  ]),
  cue('fri-summing-causation', 'summing-up', 'summing-up', [
    turn('fri-summing-causation__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Your second question is whether that omission was a substantial and operating cause of Ilan Saye’s death. An omission causes death if it materially accelerates death. Apply the criminal standard to Doctor Eren Vos’s bounded opinion and its assumptions. The law does not require certainty, but the word probably does not automatically satisfy proof beyond reasonable doubt. If a reasonable possibility remains on the evidence that timely dispatch would not have prevented or materially postponed death, you must acquit Mara Venn of both homicide offences.'),
  ]),
  cue('fri-summing-intent', 'summing-up', 'summing-up', [
    turn('fri-summing-intent__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Third, only if the first two questions are proved: at the time of withholding dispatch, did Mara Venn intend death or really serious injury? You may infer intent from proved circumstances, including words, actions and any motive you find. The inference must be the only reasonable one. Recklessness, indifference, negligence or anger is not the intent required by section eighteen.'),
  ]),
  cue('fri-summing-manslaughter', 'summing-up', 'summing-up', [
    turn('fri-summing-manslaughter__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Only if murder is not proved should you consider manslaughter under section twenty-two. Ask whether Mara Venn deliberately omitted a dispatch step required by her duty, whether that omission caused death, and whether her departure from reasonable care was so great, with so high a risk of death or serious injury, that it merits criminal punishment. This offence does not require an intention to harm.'),
  ]),
  cue('fri-summing-no-compromise', 'summing-up', 'summing-up', [
    turn('fri-summing-no-compromise__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Manslaughter is not a compromise between jurors who favour murder and jurors who favour acquittal. It is a separate offence with separate elements. Return that verdict only if all of you are satisfied beyond reasonable doubt that each of its elements is proved. If causation or criminal negligence is not proved, the lawful verdict is not guilty.'),
  ]),
  cue('fri-summing-expert', 'summing-up', 'summing-up', [
    turn('fri-summing-expert__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Doctor Eren Vos and Tali Rusk are experts in different fields. Consider their qualifications, reasoning, assumptions, concessions and consistency with proved facts. Neither may decide legal causation, Mara Venn’s intention or your verdict. The distress recording may be replayed, but do not give it greater weight merely because a recording feels vivid or can be repeated.'),
  ]),
  cue('fri-summing-motive', 'summing-up', 'summing-up', [
    turn('fri-summing-motive__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Oren Vale reported Mara Venn asking whether “Ilan was trying to end my career.” You may consider that reported question only on whether she knew about the review and whether it supplies a motive. The unfinished memorandum had not been sent to her. It cannot establish that she knew its contents or any recommendation it might contain, and it is not proof of bad character. The volunteered workplace words were excluded and are not evidence. Put them out of your minds. Do not use or discuss them for any purpose.', [['“Ilan was trying to end my career.”', 'reported', 'accused']]),
  ]),
  cue('fri-summing-exhibits', 'summing-up', 'summing-up', [
    turn('fri-summing-exhibits__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Consider each exhibit with its limitation: the diagram omits conditions; the status word ready does not show the warning detail; the warning permits launch but records risk; the log records actions under Mara Venn’s authenticated account, but neither identifies who operated the account nor reveals anyone’s state of mind; the handwritten note has no time; and the incident board records status, not belief. Accuracy about a narrow fact does not prove a larger proposition.'),
  ]),
  cue('fri-retire-direction', 'summing-up', 'retirement-direction', [
    turn('fri-retire-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'At this stage, your verdict must be unanimous. Each of you must decide personally after listening fairly to the others. Do not surrender an honestly held view merely to finish, and do not refuse to reconsider it. Do not discuss punishment. If you need legal help, send a written note through the Court Attendant without revealing ballot numbers.'),
  ]),
  cue('fri-retire', 'retire', 'retirement', [
    turn('fri-retire__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Members of the jury, you may now retire to consider your verdict. Take only the admitted exhibits and the written questions I have provided. Your deliberations are private.'),
    turn('fri-retire__2', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'All rise. Members of the jury, please follow me to the jury room.'),
  ]),
  cue('fri-adjourn', 'adjournment', 'overnight-adjournment', [
    turn('fri-adjourn__1', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'Members of the jury, please return briefly to court.'),
    turn('fri-adjourn__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Members of the jury, I authorise you to separate until tomorrow morning. Do not discuss the case with anyone or do any research while you are apart. Keep an open mind. Deliberations may resume only when all twelve of you are together in the jury room. Court is adjourned until tomorrow morning.'),
    turn('fri-adjourn__3', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'All rise.'),
  ]),
]
