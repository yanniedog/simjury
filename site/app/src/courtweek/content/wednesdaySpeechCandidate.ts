import type { CourtEvent } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  QuotedSpan,
  ReviewedSpeechCue,
  SpeechAttribution,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const WEDNESDAY_SOURCE_CUE_IDS = [
  'wed-resume-1', 'wed-resume-2', 'wed-pell-chief-1', 'wed-ready-admitted',
  'wed-pell-cross-1', 'wed-pell-re-1', 'wed-vos-chief-1', 'wed-vos-cross-1',
  'wed-vos-re-1', 'wed-def-objection', 'wed-vale-chief-1', 'wed-motive-ruling',
  'wed-vale-cross-1', 'wed-blurt', 'wed-postanswer-ruling', 'wed-record-admitted',
  'wed-crown-close-1', 'wed-adjourn-1', 'wed-adjourn-2',
] as const

export type WednesdaySourceCueId = typeof WEDNESDAY_SOURCE_CUE_IDS[number]

export interface FinalEvidenceAdmission {
  evidenceId: 'ex-ready-display' | 'ex-review' | 'ex-competing'
  status: 'final'
  operativeTurnId: string
  limitationTurnId: string
}

export interface PostAnswerStrike {
  targetTurnId: 'wed-blurt__3'
  objectionTurnId: 'wed-blurt__4'
  operativeTurnId: 'wed-postanswer-ruling__1'
  restrictionTurnId: 'wed-postanswer-ruling__2'
  replay: 'forbidden'
}

export interface WednesdaySpeechCandidateCue extends ReviewedSpeechCue {
  id: WednesdaySourceCueId
  sourceCueId: WednesdaySourceCueId
  event: CourtEvent
  evidenceAdmission?: FinalEvidenceAdmission
  strikeRuling?: PostAnswerStrike
}

type QuoteSpec = readonly [excerpt: string, source: QuotedSpan['source'], sourceActorId?: ActorId]

function turn(
  id: string, actorId: ActorId, displayLabel: string, speechMode: SpeechMode,
  legalAction: LegalAction, text: string, quoteSpecs: readonly QuoteSpec[] = [],
): SpokenTurn {
  const quotedSpans = quoteSpecs.map(([excerpt, source, sourceActorId]) => {
    const start = text.indexOf(excerpt)
    if (start < 0) throw new Error(`${id}: missing reviewed quotation ${excerpt}`)
    if (start !== text.lastIndexOf(excerpt)) throw new Error(`${id}: ambiguous reviewed quotation ${excerpt}`)
    return { start, end: start + excerpt.length, source, ...(sourceActorId ? { sourceActorId } : {}) }
  })
  return { id, actorId, displayLabel, speechMode, legalAction, text, ...(quotedSpans.length ? { quotedSpans } : {}) }
}

function cue(
  sourceCueId: WednesdaySourceCueId,
  event: CourtEvent,
  turns: readonly SpokenTurn[],
  options: {
    attributions?: readonly SpeechAttribution[]
    evidenceAdmission?: FinalEvidenceAdmission
    strikeRuling?: PostAnswerStrike
  } = {},
): WednesdaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, turns, sourceText: turns.map(({ text }) => text).join(' '), ...options }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const WEDNESDAY_SPEECH_CANDIDATE: readonly WednesdaySpeechCandidateCue[] = [
  cue('wed-resume-1', 'preliminary-direction', [
    turn('wed-resume-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Today the Crown completes its evidence. Expert opinion may help with matters outside ordinary experience, but an expert does not decide facts, credibility, intention or guilt. Test each opinion against its assumptions and concessions. A motive can make an allegation more understandable; absence of motive need not prove innocence, and possible motive never replaces proof.'),
  ]),
  cue('wed-resume-2', 'preliminary-direction', [
    turn('wed-resume-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Causation does not require mathematical certainty. The Crown must prove beyond reasonable doubt that the charged omission was a substantial and operating cause of death. A person causes death if an omission materially accelerates it. If a reasonable possibility remains that timely dispatch would neither have prevented death nor materially postponed it, the murder and manslaughter charges fail on causation.'),
  ]),
  cue('wed-pell-chief-1', 'witness-chief', [
    turn('wed-pell-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What was your role aboard Kestrel?'),
    turn('wed-pell-chief-1__2', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'I supervised the rescue crew.'),
    turn('wed-pell-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did ready mean for Kestrel?'),
    turn('wed-pell-chief-1__4', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'The crew was aboard, the engines were warm and launch was authorised.'),
    turn('wed-pell-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Was any warning active?'),
    turn('wed-pell-chief-1__6', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'Yes. A steering pressure warning was fluctuating, but our engineer had not grounded the craft.'),
    turn('wed-pell-chief-1__7', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did you tell control?'),
    turn('wed-pell-chief-1__8', 'jaro-pell', 'Jaro Pell', 'reported-testimony', 'answer', 'At twenty-one seventeen, I called on the operations channel and said, “Kestrel ready, warning monitored.”', [['“Kestrel ready, warning monitored.”', 'reported', 'jaro-pell']]),
    turn('wed-pell-chief-1__9', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'When did you receive the launch order?'),
    turn('wed-pell-chief-1__10', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'At twenty-one twenty-seven. We cast off forty-eight seconds later.'),
  ]),
  cue('wed-ready-admitted', 'exhibit-admitted', [
    turn('wed-ready-admitted__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise the North Station status snapshot?'),
    turn('wed-ready-admitted__2', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'foundation', 'Yes. It accurately records Kestrel’s status at that time.'),
    turn('wed-ready-admitted__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What does the status word ready convey?'),
    turn('wed-ready-admitted__4', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'It means the crew is aboard, the engines are warm and launch is authorised.'),
    turn('wed-ready-admitted__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Does that short label show the steering warning?'),
    turn('wed-ready-admitted__6', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'No. The warning detail appeared on a separate page. It had not grounded Kestrel, and control could call us for clarification.'),
    turn('wed-ready-admitted__7', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the North Station status snapshot on Mir’s integrity evidence and Pell’s explanation.'),
    turn('wed-ready-admitted__8', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'I admit the North Station status snapshot.'),
    turn('wed-ready-admitted__9', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'The snapshot shows the status word ready. It does not display the separate warning detail or decide whether dispatch or delay was reasonable.'),
  ], { evidenceAdmission: { evidenceId: 'ex-ready-display', status: 'final', operativeTurnId: 'wed-ready-admitted__8', limitationTurnId: 'wed-ready-admitted__9' } }),
  cue('wed-pell-cross-1', 'witness-cross', [
    turn('wed-pell-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'The warning concerned steering pressure in heavy seas?'),
    turn('wed-pell-cross-1__2', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'Yes.'),
    turn('wed-pell-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'A serious loss could endanger five rescuers?'),
    turn('wed-pell-cross-1__4', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'It could, although our engineer judged launch permissible.'),
    turn('wed-pell-cross-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'You never spoke directly to Venn?'),
    turn('wed-pell-cross-1__6', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'My call went through the operations channel.'),
    turn('wed-pell-cross-1__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'So you cannot say she heard your exact words?'),
    turn('wed-pell-cross-1__8', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'I cannot say she personally heard them.'),
  ]),
  cue('wed-pell-re-1', 'witness-reexamination', [
    turn('wed-pell-re-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Did the warning require an eleven-minute diagnostic before launch?'),
    turn('wed-pell-re-1__2', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'No. The engineer was monitoring it continuously. We needed no instruction to continue.'),
    turn('wed-pell-re-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'If control wanted clarification, could it call?'),
    turn('wed-pell-re-1__4', 'jaro-pell', 'Jaro Pell', 'live-proceeding', 'answer', 'At any time. Our channel remained open.'),
  ]),
  cue('wed-vos-chief-1', 'witness-chief', [
    turn('wed-vos-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Please tell the jury your qualifications.'),
    turn('wed-vos-chief-1__2', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'foundation', 'I am a marine survival physician with fourteen years of clinical and research experience in cold water immersion.'),
    turn('wed-vos-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What material did you use for your opinion?'),
    turn('wed-vos-chief-1__4', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'foundation', 'I used accepted immersion datasets, the recorded water temperature, clothing, reported injury and rescue track. My report identifies the source tables and assumptions, and both sides received them.'),
    turn('wed-vos-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What is your opinion about the effect of the dispatch time?'),
    turn('wed-vos-chief-1__6', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'answer', 'There is no clock that reveals the precise moment of a person’s death. In my opinion, dispatch at twenty-one sixteen would probably have placed recovery inside a medically significant survival window. Dispatch at twenty-one twenty-seven probably placed it outside. I use probably deliberately; I cannot promise survival.'),
  ]),
  cue('wed-vos-cross-1', 'witness-cross', [
    turn('wed-vos-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Your model assumes Kestrel followed the ordinary route without a steering interruption?'),
    turn('wed-vos-cross-1__2', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'answer', 'Yes.'),
    turn('wed-vos-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'It assumes Saye entered the water near the last transmission?'),
    turn('wed-vos-cross-1__4', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'answer', 'Within a range.'),
    turn('wed-vos-cross-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'At the pessimistic end of that range, timely dispatch may still have been too late?'),
    turn('wed-vos-cross-1__6', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'answer', 'That remains possible, though less likely on the data I accepted.'),
  ]),
  cue('wed-vos-re-1', 'witness-reexamination', [
    turn('wed-vos-re-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Does acknowledging that possibility withdraw your opinion?'),
    turn('wed-vos-re-1__2', 'eren-vos', 'Dr Eren Vos', 'live-proceeding', 'answer', 'No. Medicine often compares probabilities without certainty. On the accepted facts, eleven minutes materially changed the survival prospect. Whether that evidence satisfies the criminal standard and proves legal causation is for the jury, not me.'),
  ]),
  cue('wed-def-objection', 'objection', [
    turn('wed-def-objection__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Director Vale, did Venn speak to you about Saye’s unfinished review?'),
    turn('wed-def-objection__2', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'objection', 'Objection, Your Honour. Relevance.'),
    turn('wed-def-objection__3', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'A conversation about an unfinished review proves no intention during a later emergency.'),
    turn('wed-def-objection__4', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'It may establish knowledge and a possible motive; I do not offer it as proof by itself.'),
    turn('wed-def-objection__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'I allow the question. The witness may answer.'),
    turn('wed-def-objection__6', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'The answer and any document may be considered only on possible knowledge and motive, subject to the limits counsel identified.'),
  ]),
  cue('wed-vale-chief-1', 'exhibit-admitted', [
    turn('wed-vale-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What is your role?'),
    turn('wed-vale-chief-1__2', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'I direct compliance reviews.'),
    turn('wed-vale-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise this unfinished memorandum?'),
    turn('wed-vale-chief-1__4', 'oren-vale', 'Oren Vale', 'live-proceeding', 'foundation', 'Yes. Ilan Saye stored it in our safety office system. I recognise the usual format, and unchanged metadata identifies Saye as the author.'),
    turn('wed-vale-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did it propose, and was it sent to Mara Venn?'),
    turn('wed-vale-chief-1__6', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'It proposed suspending her certification because of two earlier response delays. It was not sent to her.'),
    turn('wed-vale-chief-1__7', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Before the storm, did Mara Venn say anything to you about Ilan Saye’s review?'),
    turn('wed-vale-chief-1__8', 'oren-vale', 'Oren Vale', 'reported-testimony', 'answer', 'Three days before the storm, I heard her ask whether “Ilan was trying to end my career.” I told her the review was unfinished and no decision had been made.', [['“Ilan was trying to end my career.”', 'reported', 'accused']]),
    turn('wed-vale-chief-1__9', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the unfinished memorandum.'),
    turn('wed-vale-chief-1__10', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'No further objection, subject to the ruling.'),
    turn('wed-vale-chief-1__11', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'I admit the unfinished memorandum.'),
    turn('wed-vale-chief-1__12', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Use it only for possible knowledge and motive if you find that connection. It is not a final finding and is not proof of character.'),
  ], {
    attributions: [{ marker: 'Mara Venn say', actorId: 'accused', kind: 'reported' }],
    evidenceAdmission: { evidenceId: 'ex-review', status: 'final', operativeTurnId: 'wed-vale-chief-1__11', limitationTurnId: 'wed-vale-chief-1__12' },
  }),
  cue('wed-motive-ruling', 'ruling', [
    turn('wed-motive-ruling__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'A person may resent another and still perform a duty lawfully. Do not reason that resentment proves criminal character. First decide what Venn knew of the unfinished review. Only then ask whether that knowledge assists, alongside other evidence, in explaining a proved action.'),
  ]),
  cue('wed-vale-cross-1', 'witness-cross', [
    turn('wed-vale-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'The memorandum was unfinished, never sent to Venn and might have changed after her response?'),
    turn('wed-vale-cross-1__2', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'Yes.'),
    turn('wed-vale-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'You cannot say what Saye would ultimately recommend?'),
    turn('wed-vale-cross-1__4', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'No.'),
    turn('wed-vale-cross-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Nor whether Venn believed the review would be fair?'),
    turn('wed-vale-cross-1__6', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'I can only repeat her question.'),
  ]),
  cue('wed-blurt', 'witness-cross', [
    turn('wed-blurt__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Apart from that unfinished memorandum, you had no personal knowledge of another prior delay by Venn?'),
    turn('wed-blurt__2', 'oren-vale', 'Oren Vale', 'live-proceeding', 'answer', 'No personal knowledge.'),
    turn('wed-blurt__3', 'oren-vale', 'Oren Vale', 'reported-testimony', 'answer', 'People in the office said she had done this before—'),
    turn('wed-blurt__4', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'objection', 'Objection.'),
  ]),
  cue('wed-postanswer-ruling', 'ruling', [
    turn('wed-postanswer-ruling__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'I uphold the objection. The volunteered words are excluded and are not evidence.'),
    turn('wed-postanswer-ruling__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Put those words out of your minds. They are untested hearsay, not evidence of any earlier act, habit or character. Do not use or discuss them for any purpose. Counsel, move to another subject.'),
  ], { strikeRuling: { targetTurnId: 'wed-blurt__3', objectionTurnId: 'wed-blurt__4', operativeTurnId: 'wed-postanswer-ruling__1', restrictionTurnId: 'wed-postanswer-ruling__2', replay: 'forbidden' } }),
  cue('wed-record-admitted', 'exhibit-admitted', [
    turn('wed-record-admitted__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the complete concurrent incident export. Its archive link, digital fingerprint and verified clock rest on Mir’s evidence tested yesterday; Dorn identified the assignments.'),
    turn('wed-record-admitted__2', 'defence-counsel', 'Defence counsel Corin Dax', 'advocacy', 'submission', 'No separate integrity objection.'),
    turn('wed-record-admitted__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The complete concurrent-incident export is admitted.'),
    turn('wed-record-admitted__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'It lists four matters and existing assignments, but records status rather than everything Venn may have believed about urgency.'),
  ], { evidenceAdmission: { evidenceId: 'ex-competing', status: 'final', operativeTurnId: 'wed-record-admitted__3', limitationTurnId: 'wed-record-admitted__4' } }),
  cue('wed-crown-close-1', 'crown-close', [
    turn('wed-crown-close-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'Your Honour, that is the case for the Crown.'),
  ]),
  cue('wed-adjourn-1', 'adjournment', [
    turn('wed-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Do not treat the end of the Crown case as a time for a verdict. The defence may call evidence or may require the Crown to stand on what it has proved. Neither choice changes the burden. The struck words are legally absent. If they recur in your mind, put them aside without discussing their content. Court is adjourned until tomorrow morning.'),
  ]),
  cue('wed-adjourn-2', 'adjournment', [
    turn('wed-adjourn-2__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'All rise.'),
    turn('wed-adjourn-2__2', 'narrator', 'Narrator', 'narration', 'narration', 'Tomorrow the defence will open and call two witnesses. Keep your notes provisional and private.'),
  ]),
]
