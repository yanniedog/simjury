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
    turn('fri-crown-closing-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'I ask you to reason from the joined circumstances, not one dramatic phrase. Venn heard and repeated AR-71. Her authenticated session accepted, downgraded and confirmed it. Her answer singled it out: “No. Seventy-one waits.” Another craft was already handling the greater visible peril. Kestrel was READY, clarification was available, no diagnostic required eleven minutes, and the craft later launched with the warning unchanged.', [['“No. Seventy-one waits.”', 'reported', 'accused']]),
  ]),
  cue('fri-crown-closing-2', 'crown-closing', 'crown-address', [
    turn('fri-crown-closing-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'Why hold this incident? The unfinished review supplied a reason, though motive alone proves nothing. I submit that the note, manual actions and eleven-minute hold support an intention to cause death or really serious injury. Vos’s medical evidence does not prove that Venn knew when a survival window would close; it supports a finding that timely dispatch would materially accelerate rescue. If murderous intent is not proved, consider manslaughter separately, never as a compromise: I submit that deliberately withholding reasonable dispatch steps, despite the accepted distress duty, available clarification and a launch-capable craft, caused death and fell so far below reasonable care—with so high a risk of death or serious injury—that it merits criminal punishment.'),
  ]),
  cue('fri-defence-closing-1', 'defence-closing', 'defence-address', [
    turn('fri-defence-closing-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Do not let the death rewrite the decision as it appeared at 21:16. The room was saturated, READY concealed a genuine warning, and even Dorn first wondered which rescue the hold concerned. Rusk identified a recognised error mechanism without pretending to read Venn’s mind. Quill confirmed the safety risk was real. A bad judgment may be deliberate in action yet innocent of murderous purpose.'),
  ]),
  cue('fri-defence-closing-2', 'defence-closing', 'defence-address', [
    turn('fri-defence-closing-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Causation remains uncertain. Vos assumed route, immersion range and no steering interruption; at the pessimistic end, timely dispatch may still have been too late. Manslaughter is not a compromise for doubts about murder. Even if you find a deliberate duty breach, the Crown must prove it caused death and fell so far below reasonable care, with so high a risk of death or serious injury, that it merits criminal punishment. The genuine warning, overloaded room, ambiguous READY tile and available safety assessment bear directly on that demanding question. Venn need not explain the eleven minutes. Unless the Crown excludes reasonable error, safety assessment and same-outcome possibilities beyond reasonable doubt, neither offence is proved.'),
  ]),
  cue('fri-summing-burden', 'summing-up', 'summing-up', [
    turn('fri-summing-burden__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Counsel’s addresses are submissions, not evidence. Where their recollection differs from yours, your honest recollection governs. Venn remains presumed innocent. She has not testified and that fact may not be used against her in any way. The Crown must prove every required fact beyond reasonable doubt; Venn need not prove accident, error, safety concern or any other possibility.'),
  ]),
  cue('fri-summing-circumstantial', 'summing-up', 'summing-up', [
    turn('fri-summing-circumstantial__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The Crown relies substantially on circumstantial reasoning. You may combine circumstances, but guilt must be the only reasonable conclusion available from the proved facts. An alternative is not reasonable merely because imagination can state it; nor may you reject an evidence-based alternative because it is inconvenient or not proved by the defence.'),
  ]),
  cue('fri-summing-duty', 'summing-up', 'summing-up', [
    turn('fri-summing-duty__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Consider murder first. It is agreed that Venn accepted AR-71 as a credible distress alert at 21:16:08 and that section 41 then imposed the accepted-alert duty. Your first live question is whether Venn intentionally failed to take a reasonable dispatch step, without reasonably prioritising a greater imminent peril. A conscious hold is not enough if the Crown leaves a reasonable possibility that it was reasonable safety prioritisation.'),
  ]),
  cue('fri-summing-causation', 'summing-up', 'summing-up', [
    turn('fri-summing-causation__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Your second question is whether that omission substantially and operatively caused Saye’s death. Apply the criminal standard to Vos’s bounded opinion and its assumptions. The law does not require certainty, but probability language does not automatically satisfy reasonable doubt. If a reasonable same-outcome possibility remains, acquit of both homicide offences.'),
  ]),
  cue('fri-summing-intent', 'summing-up', 'summing-up', [
    turn('fri-summing-intent__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Third, only if the first two live questions are proved: at the time of withholding dispatch, did Venn intend death or really serious injury? You may infer intent from proved circumstances, including words, actions and any motive you find. The inference must be the only reasonable one. Recklessness, indifference, negligence or anger is not the intent required by s 18.'),
  ]),
  cue('fri-summing-manslaughter', 'summing-up', 'summing-up', [
    turn('fri-summing-manslaughter__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'If, and only if, murder is not proved, consider manslaughter under s 22. Ask whether Venn deliberately omitted a dispatch step required by her duty, whether that omission caused death, and whether her departure from reasonable care was so great, with so high a risk of death or serious injury, that it merits criminal punishment. This offence does not require an intention to harm.'),
  ]),
  cue('fri-summing-no-compromise', 'summing-up', 'summing-up', [
    turn('fri-summing-no-compromise__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Manslaughter is not a compromise between jurors who favour murder and jurors who favour acquittal. It is a separate offence with separate elements. Return it only if every juror joining that verdict is satisfied of those elements beyond reasonable doubt. If causation or criminal negligence is not proved, the lawful verdict is Not Guilty.'),
  ]),
  cue('fri-summing-expert', 'summing-up', 'summing-up', [
    turn('fri-summing-expert__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Vos and Rusk are experts in different fields. Consider qualifications, reasoning, assumptions, concessions and consistency with proved facts. Neither may decide legal causation, Venn’s intention or your verdict. The distress recording may be replayed, but do not give it greater weight merely because a recording feels vivid or can be repeated.'),
  ]),
  cue('fri-summing-motive', 'summing-up', 'summing-up', [
    turn('fri-summing-motive__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'The review memorandum is available only on possible knowledge and motive. It was unfinished and unseen. It is not proof of bad character. The volunteered workplace words were struck and are legally absent; they cannot support propensity, motive, credibility or any other inference and are not available in your juror desk.'),
  ]),
  cue('fri-summing-exhibits', 'summing-up', 'summing-up', [
    turn('fri-summing-exhibits__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Read each exhibit with its limitation: the diagram omits conditions; READY omits warning detail; the warning permits launch but records risk; the log shows authenticated actions, not mind; the handwritten note has no time; the incident board records status, not belief. Accuracy about a narrow fact does not prove a larger proposition.'),
  ]),
  cue('fri-retire-direction', 'summing-up', 'retirement-direction', [
    turn('fri-retire-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Your verdict should be unanimous if honest discussion can achieve it. Each juror must decide personally after listening fairly to the others. Do not surrender an honestly held view merely to finish, and do not refuse to reconsider it. Do not discuss punishment. If you need legal help, send a written note through the court officer without revealing ballot numbers.'),
  ]),
  cue('fri-retire', 'retire', 'retirement', [
    turn('fri-retire__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Members of the jury, you may now retire to consider your verdict. Take only the admitted exhibits and question trail. Your deliberations are private.'),
    turn('fri-retire__2', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'All rise. Members of the jury, please follow me to the jury room. The accused remains before the court.'),
  ]),
  cue('fri-adjourn', 'adjournment', 'overnight-adjournment', [
    turn('fri-adjourn__1', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'Members of the jury, please return briefly to court.'),
    turn('fri-adjourn__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'I am told you have appointed a foreperson and identified the questions requiring discussion, but have taken no ballot. I authorise you to separate until tomorrow. Do not discuss or research the case. Your retirement has begun; deliberations resume only when all twelve are together.'),
  ]),
]
