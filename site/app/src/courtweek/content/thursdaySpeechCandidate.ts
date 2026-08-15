import type { CourtEvent } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  QuotedSpan,
  ReviewedSpeechCue,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const THURSDAY_SOURCE_CUE_IDS = [
  'thu-def-opening', 'thu-silence', 'thu-rusk-chief-1', 'thu-rusk-chief-2',
  'thu-rusk-cross-1', 'thu-crown-objection', 'thu-rusk-re-1', 'thu-quill-chief-1',
  'thu-warning-admitted', 'thu-quill-cross-1', 'thu-quill-re-1',
  'thu-defence-theory', 'thu-silence-repeat', 'thu-def-close-1',
  'thu-close-direction', 'thu-adjourn-1', 'thu-adjourn-2',
] as const

export type ThursdaySourceCueId = typeof THURSDAY_SOURCE_CUE_IDS[number]

export interface SilenceDirectionReview {
  adverseInference: 'forbidden'
  operativeTurnId: string
  electionTurnId?: string
}

export interface WarningAdmissionReview {
  evidenceId: 'ex-warning'
  status: 'final'
  operativeTurnId: 'thu-warning-admitted__10'
  limitationTurnId: 'thu-warning-admitted__11'
}

export interface DefenceClosureReview {
  status: 'closed'
  operativeTurnId: 'thu-def-close-1__1'
}

export interface ThursdaySpeechCandidateCue extends ReviewedSpeechCue {
  id: ThursdaySourceCueId
  sourceCueId: ThursdaySourceCueId
  event: CourtEvent
  silenceDirection?: SilenceDirectionReview
  warningAdmission?: WarningAdmissionReview
  defenceClosure?: DefenceClosureReview
}

type QuoteSpec = readonly [excerpt: string, source: QuotedSpan['source'], sourceActorId?: ActorId]

function turn(
  id: string, actorId: ActorId, displayLabel: string, speechMode: SpeechMode,
  legalAction: LegalAction, text: string, quoteSpecs: readonly QuoteSpec[] = [],
): SpokenTurn {
  const quotedSpans = quoteSpecs.map(([excerpt, source, sourceActorId]) => {
    const start = text.indexOf(excerpt)
    if (start < 0) throw new Error(`${id}: missing reviewed quotation ${excerpt}`)
    if (start !== text.lastIndexOf(excerpt)) {
      throw new Error(`${id}: ambiguous reviewed quotation ${excerpt}`)
    }
    return { start, end: start + excerpt.length, source, ...(sourceActorId ? { sourceActorId } : {}) }
  })
  return { id, actorId, displayLabel, speechMode, legalAction, text, ...(quotedSpans.length ? { quotedSpans } : {}) }
}

function cue(
  sourceCueId: ThursdaySourceCueId,
  event: CourtEvent,
  turns: readonly SpokenTurn[],
  options: {
    silenceDirection?: SilenceDirectionReview
    warningAdmission?: WarningAdmissionReview
    defenceClosure?: DefenceClosureReview
  } = {},
): ThursdaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, turns, sourceText: turns.map(({ text }) => text).join(' '), ...options }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const THURSDAY_SPEECH_CANDIDATE: readonly ThursdaySpeechCandidateCue[] = [
  cue('thu-def-opening', 'defence-opening', [
    turn('thu-def-opening__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'We do not ask you to regard the response as satisfactory. The Crown must still prove an unlawful breach of duty, that the delay caused the death and, for murder, an intention to cause death or really serious injury. You will hear how competing alarms, an ambiguous display and a genuine steering warning may explain a deliberate hold without proving murderous intent. A tragic outcome does not by itself establish criminal responsibility or any disputed element.'),
  ]),
  cue('thu-silence', 'silence-direction', [
    turn('thu-silence__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Mara Venn will not give evidence.'),
    turn('thu-silence__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The accused has an absolute right not to give evidence. Her silence cannot fill a gap in the Crown case, strengthen that case, show guilt or be used for any adverse purpose. Decide whether the Crown has proved its case. Do not require the accused to prove an alternative account.'),
  ], { silenceDirection: { adverseInference: 'forbidden', electionTurnId: 'thu-silence__1', operativeTurnId: 'thu-silence__2' } }),
  cue('thu-rusk-chief-1', 'witness-chief', [
    turn('thu-rusk-chief-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Please tell the jury about your work.'),
    turn('thu-rusk-chief-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'foundation', 'I am a human factors engineer. For twelve years I have studied how people make decisions in control rooms with many alarms.'),
    turn('thu-rusk-chief-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What material did you review in this case?'),
    turn('thu-rusk-chief-1__4', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'foundation', 'I reviewed the disclosed display layout, incident sequence and alert conditions. I did not interview or diagnose Mara Venn.'),
    turn('thu-rusk-chief-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'How was the relevant information arranged on the display?'),
    turn('thu-rusk-chief-1__6', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'It showed priority, craft status and several alerts together, while the warning detail appeared on another page.'),
    turn('thu-rusk-chief-1__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What can happen when a person is under heavy demand?'),
    turn('thu-rusk-chief-1__8', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'A person may deliberately press a control but misunderstand which risk the action is managing. That is a recognised mechanism. It cannot establish whether Mara Venn made such an error.'),
  ]),
  cue('thu-rusk-chief-2', 'witness-chief', [
    turn('thu-rusk-chief-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Why did the word ready matter to your analysis?'),
    turn('thu-rusk-chief-2__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'A reassuring label can capture attention before a person opens the detail behind it. The opposite can also happen: a person remembers a warning and gives it too much weight without checking the current detail.'),
    turn('thu-rusk-chief-2__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What, if anything, can you conclude from the handwritten note?'),
    turn('thu-rusk-chief-2__4', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'The note “hold—readiness” shows that readiness was on the writer’s mind. It gives no reason. Human factors evidence cannot tell us whether the writer was taking a precaution, had mistaken the risk or had some reason unrelated to safety.', [['“hold—readiness”', 'written', 'accused']]),
  ]),
  cue('thu-rusk-cross-1', 'witness-cross', [
    turn('thu-rusk-cross-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Your mechanism cannot explain why Mara Venn repeated incident code A R seventy-one and said “seventy-one waits”, can it?', [['“seventy-one waits”', 'reported', 'accused']]),
    turn('thu-rusk-cross-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'It may explain how she classified competing risks. It cannot show that she failed to hear the number.'),
    turn('thu-rusk-cross-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'She then confirmed the downgrade?'),
    turn('thu-rusk-cross-1__4', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'Yes. A deliberate confirmation can still carry out a mistaken judgment.'),
    turn('thu-rusk-cross-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'You cannot say that is what happened here?'),
    turn('thu-rusk-cross-1__6', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'No.'),
  ]),
  cue('thu-crown-objection', 'objection', [
    turn('thu-crown-objection__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'So the Crown’s theory ignores everything known about human cognition?'),
    turn('thu-crown-objection__2', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'objection', 'Objection, Your Honour. That is argumentative.'),
    turn('thu-crown-objection__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'I uphold the objection. The witness is not to answer.'),
    turn('thu-crown-objection__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'On re-examination, counsel may clarify the limits of the expert’s opinion. Counsel may not ask the witness to endorse criticism of the Crown case.'),
  ]),
  cue('thu-rusk-re-1', 'witness-reexamination', [
    turn('thu-rusk-re-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Is describing a recognised mechanism the same as saying it occurred?'),
    turn('thu-rusk-re-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'No. The conditions I reviewed are capable of producing the mechanism I described, but I cannot say whether it occurred here. I offer no opinion about intention, credibility or the verdict.'),
  ]),
  cue('thu-quill-chief-1', 'witness-chief', [
    turn('thu-quill-chief-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What entry did you make before the shift?'),
    turn('thu-quill-chief-1__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'I recorded an intermittent fluctuation in the steering pressure.'),
    turn('thu-quill-chief-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What effect, if any, did that warning have on whether Kestrel could launch?'),
    turn('thu-quill-chief-1__4', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'It did not prevent launch. Launch was permitted, but in those seas a worsening fault could make the return dangerous.'),
    turn('thu-quill-chief-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'How did the warning appear to a controller?'),
    turn('thu-quill-chief-1__6', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'The main status tile said ready. An amber symbol led to my detailed entry.'),
    turn('thu-quill-chief-1__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Could you tell whether Mara Venn opened that entry?'),
    turn('thu-quill-chief-1__8', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No.'),
    turn('thu-quill-chief-1__9', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What options did a controller have?'),
    turn('thu-quill-chief-1__10', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'A controller could ask us for advice or dispatch the craft.'),
  ]),
  cue('thu-warning-admitted', 'exhibit-admitted', [
    turn('thu-warning-admitted__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Do you recognise this maintenance entry?'),
    turn('thu-warning-admitted__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'foundation', 'Yes. I made it before the shift, when I recorded the steering pressure fluctuation.'),
    turn('thu-warning-admitted__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Please tell the jury exactly what you wrote.'),
    turn('thu-warning-admitted__4', 'sera-quill', 'Sera Quill', 'written-text-read', 'answer', '“Monitor on launch; abort for sustained pressure loss.”', [['“Monitor on launch; abort for sustained pressure loss.”', 'written', 'sera-quill']]),
    turn('thu-warning-admitted__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What did the instruction to monitor on launch mean?'),
    turn('thu-warning-admitted__6', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'It meant launch was permitted, but the risk was real and had to be monitored.'),
    turn('thu-warning-admitted__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'What, if anything, did your entry specify about a hold, its duration or the decision a controller should make?'),
    turn('thu-warning-admitted__8', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'It specified none of those things.'),
    turn('thu-warning-admitted__9', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'tender', 'I tender the contemporaneous maintenance entry.'),
    turn('thu-warning-admitted__10', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'I admit the maintenance entry.'),
    turn('thu-warning-admitted__11', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'The entry records the warning and that a monitored launch was permitted. It does not decide whether any delay was reasonable, what information Mara Venn saw or what she understood.'),
  ], { warningAdmission: { evidenceId: 'ex-warning', status: 'final', operativeTurnId: 'thu-warning-admitted__10', limitationTurnId: 'thu-warning-admitted__11' } }),
  cue('thu-quill-cross-1', 'witness-cross', [
    turn('thu-quill-cross-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'No one directed that Kestrel be grounded?'),
    turn('thu-quill-cross-1__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No.'),
    turn('thu-quill-cross-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Nothing in your entry required a diagnostic lasting eleven minutes?'),
    turn('thu-quill-cross-1__4', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No.'),
    turn('thu-quill-cross-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Control could contact you or Jaro Pell for advice?'),
    turn('thu-quill-cross-1__6', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Yes.'),
    turn('thu-quill-cross-1__7', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Kestrel later launched while the same warning remained?'),
    turn('thu-quill-cross-1__8', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Yes. We monitored it throughout.'),
  ]),
  cue('thu-quill-re-1', 'witness-reexamination', [
    turn('thu-quill-re-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Counsel asked whether control could contact you. What could you have told them?'),
    turn('thu-quill-re-1__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'The fluctuation was intermittent, monitored launch was permitted, and abort was required only for sustained pressure loss.'),
    turn('thu-quill-re-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Did the main ready tile show that detail?'),
    turn('thu-quill-re-1__4', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No. It required opening the warning page or asking operations.'),
  ]),
  cue('thu-defence-theory', 'preliminary-direction', [
    turn('thu-defence-theory__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Our case is that the warning and the display may explain the hold as a mistaken safety assessment, rather than an intention to cause death or really serious injury.'),
    turn('thu-defence-theory__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'That is counsel’s submission, not evidence. The evidence about the display and the warning remains subject to the limits you have heard. The Crown bears the burden of proving every element beyond reasonable doubt.'),
  ]),
  cue('thu-silence-repeat', 'silence-direction', [
    turn('thu-silence-repeat__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Mara Venn’s decision not to give evidence does not alter the burden of proof. Draw no adverse inference from her silence. The Crown must prove each element beyond reasonable doubt. If a reasonable possibility consistent with innocence remains on the evidence about an element, that element is not proved beyond reasonable doubt.'),
  ], { silenceDirection: { adverseInference: 'forbidden', operativeTurnId: 'thu-silence-repeat__1' } }),
  cue('thu-def-close-1', 'defence-close', [
    turn('thu-def-close-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Your Honour, the defence calls no further evidence and closes its case.'),
  ], { defenceClosure: { status: 'closed', operativeTurnId: 'thu-def-close-1__1' } }),
  cue('thu-close-direction', 'preliminary-direction', [
    turn('thu-close-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The evidence is now closed. Tomorrow the Crown and the defence will address you. Their submissions are not evidence. I will then direct you on the law and the possible verdicts.'),
  ]),
  cue('thu-adjourn-1', 'adjournment', [
    turn('thu-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Continue to withhold your verdict. Consider the evidence as a whole, while keeping the limits of each item in mind. Do not decide the case by counting witnesses or exhibits. Tomorrow you will hear the parties’ addresses and my directions on the law. The court is adjourned until tomorrow.'),
  ]),
  cue('thu-adjourn-2', 'adjournment', [
    turn('thu-adjourn-2__1', 'court-officer', 'Court Attendant', 'live-proceeding', 'none', 'All rise.'),
    turn('thu-adjourn-2__2', 'narrator', 'Narrator', 'narration', 'narration', 'The courtroom empties. The evidence ledger identifies the admitted material that may be used as evidence. Your private notes remain on this device.'),
  ]),
]
