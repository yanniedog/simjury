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
  operativeTurnId: 'thu-warning-admitted__5'
  limitationTurnId: 'thu-warning-admitted__6'
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
    turn('thu-def-opening__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'We do not ask you to call the response satisfactory. The Crown must still prove an unlawful duty breach, what the delay caused and, for murder, an intention to cause death or really serious injury. You will hear how alarm saturation, ambiguous status design and a genuine steering warning can produce a conscious hold without murderous intent. A bad outcome does not answer any legal element by itself.'),
  ]),
  cue('thu-silence', 'silence-direction', [
    turn('thu-silence__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Mara Venn will not give evidence.'),
    turn('thu-silence__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The accused has an absolute right not to give evidence. Her silence cannot fill a gap, strengthen the Crown case, show guilt, avoid an explanation or be used in deliberation for any adverse purpose. Decide whether the Crown evidence proves its case; do not ask the accused to prove an alternative story.'),
  ], { silenceDirection: { adverseInference: 'forbidden', electionTurnId: 'thu-silence__1', operativeTurnId: 'thu-silence__2' } }),
  cue('thu-rusk-chief-1', 'witness-chief', [
    turn('thu-rusk-chief-1__1', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'foundation', 'I am a human-factors engineer with twelve years’ experience studying decisions in high-alarm control rooms. I reviewed the disclosed display layout, incident sequence and alert conditions, but did not interview or diagnose Venn.'),
    turn('thu-rusk-chief-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'The display placed priority, craft status and multiple alerts together while warning detail sat on another page. Under overload, a person may consciously press a control yet misunderstand which risk the action manages. That is a recognised mechanism; it does not tell you Venn made that error.'),
  ]),
  cue('thu-rusk-chief-2', 'witness-chief', [
    turn('thu-rusk-chief-2__1', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'The word READY is especially vulnerable to label capture: attention stops at the reassuring headline or, conversely, overreacts to a remembered warning without reopening its detail. The note “hold—readiness” shows that readiness was on the writer’s mind, but not why. Human-factors science cannot distinguish a precaution, mistaken risk classification or a reason unrelated to safety.', [['“hold—readiness”', 'written', 'accused']]),
  ]),
  cue('thu-rusk-cross-1', 'witness-cross', [
    turn('thu-rusk-cross-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Your mechanism does not explain why Venn repeated AR-71 and the words “seventy-one waits”?', [['“seventy-one waits”', 'reported', 'accused']]),
    turn('thu-rusk-cross-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'It can explain competing-risk classification, not failure to hear the number.'),
    turn('thu-rusk-cross-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Nor why she confirmed a downgrade?'),
    turn('thu-rusk-cross-1__4', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'A conscious confirmation can still implement an erroneous judgment.'),
    turn('thu-rusk-cross-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'You offer a possibility, not a diagnosis?'),
    turn('thu-rusk-cross-1__6', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'Correct.'),
  ]),
  cue('thu-crown-objection', 'objection', [
    turn('thu-crown-objection__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'So the Crown’s theory ignores everything known about human cognition?'),
    turn('thu-crown-objection__2', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'objection', 'Objection—argumentative.'),
    turn('thu-crown-objection__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'Sustained. The witness must not answer.'),
    turn('thu-crown-objection__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Re-examination may clarify the expert’s limits, not ask her to endorse counsel’s criticism of the opposing case.'),
  ]),
  cue('thu-rusk-re-1', 'witness-reexamination', [
    turn('thu-rusk-re-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Is describing a recognised mechanism the same as saying it occurred?'),
    turn('thu-rusk-re-1__2', 'tali-rusk', 'Tali Rusk', 'live-proceeding', 'answer', 'No. It helps a jury evaluate whether error remains reasonably possible given the actual conditions. It is not an opinion on intention, credibility or verdict.'),
  ]),
  cue('thu-quill-chief-1', 'witness-chief', [
    turn('thu-quill-chief-1__1', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Before shift I recorded intermittent steering-pressure fluctuation. It did not ground Kestrel, but in those seas a worsening fault could make return dangerous. The controller’s status feed showed READY on its main tile and an amber symbol leading to my detail. I did not know whether Venn opened that detail. Controllers had authority to seek advice or dispatch.'),
  ]),
  cue('thu-warning-admitted', 'exhibit-admitted', [
    turn('thu-warning-admitted__1', 'sera-quill', 'Sera Quill', 'live-proceeding', 'foundation', 'This is my contemporaneous maintenance entry.'),
    turn('thu-warning-admitted__2', 'sera-quill', 'Sera Quill', 'written-text-read', 'answer', '“Monitor on launch; abort for sustained pressure loss.”', [['“Monitor on launch; abort for sustained pressure loss.”', 'written', 'sera-quill']]),
    turn('thu-warning-admitted__3', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Monitor on launch means launch was permitted. It also means the risk was not imaginary. The entry cannot establish whether a hold of one minute, eleven minutes or no time was reasonable without knowing what the controller understood.'),
    turn('thu-warning-admitted__4', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'tender', 'I tender the contemporaneous maintenance entry.'),
    turn('thu-warning-admitted__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The maintenance entry is admitted.'),
    turn('thu-warning-admitted__6', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'The entry records the warning and permitted monitored launch. It does not decide whether any particular delay was reasonable or what Venn understood.'),
  ], { warningAdmission: { evidenceId: 'ex-warning', status: 'final', operativeTurnId: 'thu-warning-admitted__5', limitationTurnId: 'thu-warning-admitted__6' } }),
  cue('thu-quill-cross-1', 'witness-cross', [
    turn('thu-quill-cross-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'No one ordered Kestrel grounded?'),
    turn('thu-quill-cross-1__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No.'),
    turn('thu-quill-cross-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'No diagnostic required eleven minutes?'),
    turn('thu-quill-cross-1__4', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No.'),
    turn('thu-quill-cross-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Control could call you or Pell?'),
    turn('thu-quill-cross-1__6', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Yes.'),
    turn('thu-quill-cross-1__7', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'The launch then occurred with the same warning still present?'),
    turn('thu-quill-cross-1__8', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'Yes, monitored throughout.'),
  ]),
  cue('thu-quill-re-1', 'witness-reexamination', [
    turn('thu-quill-re-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Cross-examination said control could call you. What operational information could you have supplied?'),
    turn('thu-quill-re-1__2', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'The fluctuation was intermittent, monitored launch was permitted, and abort was required only for sustained pressure loss.'),
    turn('thu-quill-re-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Did the main READY tile contain that detail?'),
    turn('thu-quill-re-1__4', 'sera-quill', 'Sera Quill', 'live-proceeding', 'answer', 'No. It required opening the warning page or asking operations.'),
  ]),
  cue('thu-defence-theory', 'preliminary-direction', [
    turn('thu-defence-theory__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'The defence tenders no statement from Mara Venn.'),
    turn('thu-defence-theory__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'That is procedural information, not evidence and not a final address. The system-design and warning evidence remains subject to the limits you heard. Do not yet decide whether it supports error, safety assessment or any conclusion about intention.'),
  ]),
  cue('thu-silence-repeat', 'silence-direction', [
    turn('thu-silence-repeat__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Counsel’s formulation is an argument about possibilities in admitted evidence; it is not testimony from Venn. Do not accept it merely because no one cross-examined her, and do not reject it merely because she did not testify. Ask only whether the Crown excluded reasonable possibilities consistent with innocence of each offence.'),
  ], { silenceDirection: { adverseInference: 'forbidden', operativeTurnId: 'thu-silence-repeat__1' } }),
  cue('thu-def-close-1', 'defence-close', [
    turn('thu-def-close-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'Your Honour, the defence calls no further evidence and closes its case.'),
  ], { defenceClosure: { status: 'closed', operativeTurnId: 'thu-def-close-1__1' } }),
  cue('thu-close-direction', 'preliminary-direction', [
    turn('thu-close-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'All evidence is complete. Nothing counsel says tomorrow becomes evidence. The Crown has no reply evidence and will not be permitted to split its case around the defence. Tomorrow each side addresses you, then I will give the governing law and a structured path through the possible verdicts.'),
  ]),
  cue('thu-adjourn-1', 'adjournment', [
    turn('thu-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Continue to withhold verdict. You may organise admitted evidence under duty, causation and intent. You may also note source limits. Do not count witnesses or exhibits as votes. One reliable item can outweigh many weak ones, and a number of individually uncertain circumstances do not become certain merely by accumulation.'),
  ]),
  cue('thu-adjourn-2', 'adjournment', [
    turn('thu-adjourn-2__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'The court will sit tomorrow for addresses and the final summing-up. Your private juror desk contains admitted material only. Court is adjourned.'),
  ]),
]
