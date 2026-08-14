import type { CourtEvent } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  QuotedSpan,
  ReviewedSpeechCue,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const SATURDAY_SOURCE_CUE_IDS = [
  'sat-room-1', 'sat-room-2', 'sat-room-3', 'sat-concerns-1', 'sat-concerns-2',
  'sat-concerns-3', 'sat-provisional-direction', 'sat-provisional-vote',
  'sat-first-ballot', 'sat-ballot-process', 'sat-causation-1', 'sat-causation-2',
  'sat-causation-3', 'sat-improper-1', 'sat-improper-2', 'sat-jury-note',
  'sat-judge-response', 'sat-separate-1', 'sat-separate-2',
] as const

export type SaturdaySourceCueId = typeof SATURDAY_SOURCE_CUE_IDS[number]
export type SaturdayProcedureStage =
  | 'opening-discussion' | 'concern-round' | 'provisional-ballot-direction'
  | 'sealed-player-ballot' | 'first-aggregate' | 'evidence-testing'
  | 'improper-argument-correction' | 'jury-note' | 'open-court-answer'
  | 'overnight-separation'

export interface SaturdaySpeechCandidateCue extends ReviewedSpeechCue {
  id: SaturdaySourceCueId
  sourceCueId: SaturdaySourceCueId
  event: CourtEvent
  procedureStage: SaturdayProcedureStage
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
  sourceCueId: SaturdaySourceCueId, event: CourtEvent, procedureStage: SaturdayProcedureStage,
  turns: readonly SpokenTurn[],
): SaturdaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, procedureStage, turns, sourceText: turns.map(({ text }) => text).join(' ') }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const SATURDAY_SPEECH_CANDIDATE: readonly SaturdaySpeechCandidateCue[] = [
  cue('sat-room-1', 'jury-discussion', 'opening-discussion', [
    turn('sat-room-1__1', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'none', 'No one needs to declare a verdict yet. Let us name the point that most needs testing. Mine is the step from a deliberate hold to an intention to cause death. We will use the judge’s question trail, one element at a time, and keep every claim tied to admitted evidence.'),
  ]),
  cue('sat-room-2', 'jury-discussion', 'opening-discussion', [
    turn('sat-room-2__1', 'niko-hale', 'Niko Hale', 'live-proceeding', 'none', 'My concern is causation. Vos used the word “probably” deliberately and also accepted a same-outcome possibility. That does not make the opinion worthless, but I want us to articulate why the remaining possibility is or is not reasonable on all the facts.', [['“probably”', 'reported', 'eren-vos']]),
  ]),
  cue('sat-room-3', 'jury-discussion', 'opening-discussion', [
    turn('sat-room-3__1', 'lina-fei', 'Lina Fei', 'live-proceeding', 'none', 'Mine is the warning. READY permitted launch, yet the amber detail carried a genuine rescuer risk. I want to compare the eleven-minute hold and confirmed downgrade with the proved availability of clarification and the later launch under the same condition.'),
  ]),
  cue('sat-concerns-1', 'jury-discussion', 'concern-round', [
    turn('sat-concerns-1__1', 'ari-tem', 'Ari Tem', 'live-proceeding', 'none', 'The audit log is exact about actions but silent about thought. I want to know whether words, sequence and motive legitimately close that gap.'),
    turn('sat-concerns-1__2', 'sola-iven', 'Sola Iven', 'live-proceeding', 'none', 'The repeated beacon matters more to me than the button labels. So does Venn’s reported answer: “No. Seventy-one waits.” The unfinished review of Venn troubles me only if her knowledge of it is proved.', [['“No. Seventy-one waits.”', 'reported', 'accused']]),
  ]),
  cue('sat-concerns-2', 'jury-discussion', 'concern-round', [
    turn('sat-concerns-2__1', 'bram-tey', 'Bram Tey', 'live-proceeding', 'none', 'The system design gives me a real error mechanism, not merely a story invented by counsel. But Rusk could not say it occurred.'),
    turn('sat-concerns-2__2', 'kessa-noor', 'Kessa Noor', 'live-proceeding', 'none', 'A reasonable possibility must emerge from evidence, while the defence still bears no burden to establish it.'),
  ]),
  cue('sat-concerns-3', 'jury-discussion', 'concern-round', [
    turn('sat-concerns-3__1', 'daro-sen', 'Daro Sen', 'live-proceeding', 'none', 'We should be careful not to convert eleven minutes into eleven separate proofs. Time can support an inference, but only in context.'),
    turn('sat-concerns-3__2', 'yara-merrow', 'Yara Merrow', 'live-proceeding', 'none', 'What would a person intending harm expect when the call, account and eventual release all remained permanently logged?'),
  ]),
  cue('sat-provisional-direction', 'jury-discussion', 'provisional-ballot-direction', [
    turn('sat-provisional-direction__1', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'ballot-administration', 'We will take a private provisional ballot to discover what requires discussion. It is not a verdict, and no one’s individual selection will be published. Before the aggregate appears, each of us must make an independent choice. That prevents the visible room from substituting for personal judgment.'),
  ]),
  cue('sat-provisional-vote', 'provisional-vote', 'sealed-player-ballot', [
    turn('sat-provisional-vote__1', 'court-officer', 'Court officer', 'live-proceeding', 'ballot-administration', 'Choose Murder, Manslaughter, Not Guilty or Unable to Agree at this stage. Murder means every s 18 element is presently proved. Manslaughter is reached only after murder fails and every s 22 element is proved. Unable to Agree is a provisional state, not avoidance. Your choice seals when submitted.'),
  ]),
  cue('sat-first-ballot', 'first-ballot', 'first-aggregate', [
    turn('sat-first-ballot__1', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'ballot-administration', 'The anonymous aggregate is now displayed, including your sealed position. No seat is identified. It shows division across murder, manslaughter and acquittal, with at least one juror still unable to choose. We will not treat the largest group as presumptively right. The count tells us where disagreement exists, not how to resolve it.'),
  ]),
  cue('sat-ballot-process', 'jury-discussion', 'first-aggregate', [
    turn('sat-ballot-process__1', 'omri-cade', 'Omri Cade', 'live-proceeding', 'none', 'Let us ask a person who doubts causation to state the evidence supporting that doubt, then someone else should test it without guessing their vote. Afterward we do the same for intent and criminal negligence. No names beside positions, no demand that a minority justify its existence.'),
  ]),
  cue('sat-causation-1', 'jury-discussion', 'evidence-testing', [
    turn('sat-causation-1__1', 'niko-hale', 'Niko Hale', 'live-proceeding', 'none', 'Vos places earlier recovery probably inside a significant window; the pessimistic range permits the same death. Saye was conscious near 21:16, which may make the model persuasive without certainty. Is the pessimistic possibility reasonable on all the evidence, not merely conceivable?'),
  ]),
  cue('sat-causation-2', 'jury-discussion', 'evidence-testing', [
    turn('sat-causation-2__1', 'toma-reed', 'Toma Reed', 'live-proceeding', 'none', 'The ordinary-route and uninterrupted-travel assumptions also matter. The route diagram proves distance and an ordinary path, not the conditions Kestrel would have met. We must neither invent a breakdown nor assume an interruption-free journey was proved. I presently give the model substantial, not conclusive, weight.'),
  ]),
  cue('sat-causation-3', 'jury-discussion', 'evidence-testing', [
    turn('sat-causation-3__1', 'edda-rook', 'Edda Rook', 'live-proceeding', 'none', 'That is the right form of disagreement: identify the assumption, identify the admitted fact bearing on it, then apply the burden. Nobody should say the family deserves certainty or the accused should explain the timing. Neither is a lawful reason.'),
  ]),
  cue('sat-improper-1', 'jury-discussion', 'improper-argument-correction', [
    turn('sat-improper-1__1', 'bram-tey', 'Bram Tey', 'live-proceeding', 'none', 'If Venn had an innocent explanation, she would have testified.'),
    turn('sat-improper-1__2', 'kessa-noor', 'Kessa Noor', 'live-proceeding', 'none', 'The judge forbade that reasoning. Silence supplies nothing and cannot shift the burden. Remove that claim from the board; repetition cannot turn it into evidence.'),
  ]),
  cue('sat-improper-2', 'jury-discussion', 'improper-argument-correction', [
    turn('sat-improper-2__1', 'sola-iven', 'Sola Iven', 'live-proceeding', 'none', 'What sentence follows murder?'),
    turn('sat-improper-2__2', 'edda-rook', 'Edda Rook', 'live-proceeding', 'none', 'Stop. Punishment is not our task and may distort whether elements are proved. We return to the intent inference. The same correction applies to sympathy for Saye, dislike of Venn or speculation about material the judge struck.'),
  ]),
  cue('sat-jury-note', 'jury-note', 'jury-note', [
    turn('sat-jury-note__1', 'edda-rook', 'Foreperson Edda Rook', 'written-text-read', 'jury-note', '“For murder, if we find the controller deliberately held the craft while aware that death was a possible result, is awareness of that risk enough to prove the required intent? Please restate the difference between murder and manslaughter.” The written question contains no ballot numbers or juror identities.', [['“For murder, if we find the controller deliberately held the craft while aware that death was a possible result, is awareness of that risk enough to prove the required intent? Please restate the difference between murder and manslaughter.”', 'written']]),
  ]),
  cue('sat-judge-response', 'judge-response', 'open-court-answer', [
    turn('sat-judge-response__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'No. Awareness that death or serious injury was possible, without an intention to cause either, does not satisfy s 18. For murder the Crown must prove intention to cause death or really serious injury. If murder fails, s 22 asks separately about deliberate duty breach, causation and negligence so grave, with risk so high, that it merits criminal punishment.'),
  ]),
  cue('sat-separate-1', 'adjournment', 'overnight-separation', [
    turn('sat-separate-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The jury may separate overnight. Do not discuss the case outside the jury room, communicate a view, search any subject, or consume commentary that seems analogous. Keep an open mind. Tomorrow you may reconsider any provisional position for reasons arising from lawful discussion, not merely because of the count.'),
  ]),
  cue('sat-separate-2', 'adjournment', 'overnight-separation', [
    turn('sat-separate-2__1', 'narrator', 'Narrator', 'narration', 'narration', 'The room’s anonymous aggregate and your private notes are saved locally. Individual juror positions remain sealed. Deliberation resumes tomorrow.'),
  ]),
]
