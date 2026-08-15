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

export const TUESDAY_SOURCE_CUE_IDS = [
  'tue-resume-1', 'tue-resume-2', 'tue-dorn-chief-1', 'tue-def-objection',
  'tue-def-ruling', 'tue-dorn-chief-2', 'tue-recording-foundation',
  'tue-recording-play', 'tue-dorn-cross-1', 'tue-dorn-cross-2', 'tue-dorn-re-1',
  'tue-re-direction', 'tue-mir-chief-1', 'tue-mir-chief-2', 'tue-mir-chief-3',
  'tue-mir-cross-1', 'tue-log-direction', 'tue-recording-final-admission',
  'tue-adjourn-1', 'tue-adjourn-2',
] as const

export type TuesdaySourceCueId = typeof TUESDAY_SOURCE_CUE_IDS[number]
export type TuesdayTurnId = `${TuesdaySourceCueId}__${number}`

export type RecordingAdmissionTransition =
  | { evidenceId: 'ex-distress'; status: 'provisional'; operativeTurnId: TuesdayTurnId; warningTurnId: TuesdayTurnId }
  | { evidenceId: 'ex-distress'; status: 'final'; operativeTurnId: TuesdayTurnId }

export interface TuesdaySpeechCandidateCue extends ReviewedSpeechCue {
  id: TuesdaySourceCueId
  sourceCueId: TuesdaySourceCueId
  event: CourtEvent
  recordingAdmission?: RecordingAdmissionTransition
}

type QuoteSpec = readonly [excerpt: string, source: QuotedSpan['source'], sourceActorId?: ActorId]

function turn(
  id: TuesdayTurnId,
  actorId: ActorId,
  displayLabel: string,
  speechMode: SpeechMode,
  legalAction: LegalAction,
  text: string,
  quoteSpecs: readonly QuoteSpec[] = [],
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
  sourceCueId: TuesdaySourceCueId,
  event: CourtEvent,
  turns: readonly SpokenTurn[],
  options: { attributions?: readonly SpeechAttribution[]; recordingAdmission?: RecordingAdmissionTransition } = {},
): TuesdaySpeechCandidateCue {
  return { id: sourceCueId, sourceCueId, event, turns, sourceText: turns.map(({ text }) => text).join(' '), ...options }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const TUESDAY_SPEECH_CANDIDATE: readonly TuesdaySpeechCandidateCue[] = [
  cue('tue-resume-1', 'preliminary-direction', [
    turn('tue-resume-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Yesterday you heard the allegation, evidence about the dispatch procedure and the route diagram admitted for a limited purpose. Recall the evidence as best you can, but do not invent exact words. Today you may hear a recording. I will explain its evidentiary status and any limits before it is played. If you hear it again later, do not give it extra weight merely because it has been repeated.'),
  ]),
  cue('tue-resume-2', 'preliminary-direction', [
    turn('tue-resume-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You will also hear evidence about incidents occurring at the same time. A busy control room may help explain an error, but it does not answer every question. Consider what information reached Mara Venn, what she did with it and what reasonable alternatives were then available.'),
  ]),
  cue('tue-dorn-chief-1', 'witness-chief', [
    turn('tue-dorn-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did you first hear on the distress channel?'),
    turn('tue-dorn-chief-1__2', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'The channel crackled, but I heard, “Survey vessel Lumen, beacon A R seventy-one, taking water.”', [
      ['“Survey vessel Lumen, beacon A R seventy-one, taking water.”', 'reported', 'ilan-saye'],
    ]),
    turn('tue-dorn-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did you do with the call?'),
    turn('tue-dorn-chief-1__4', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'I transferred it to Mara Venn and entered flooding as the incident type.'),
    turn('tue-dorn-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did you then hear Mara Venn say?'),
    turn('tue-dorn-chief-1__6', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'She leaned towards the speaker. When the caller repeated the beacon, I heard her say, “A R seventy-one, I have your position.”', [
      ['“A R seventy-one, I have your position.”', 'reported', 'accused'],
    ]),
  ], { attributions: [{ marker: 'Mara Venn say', actorId: 'accused', kind: 'reported' }] }),
  cue('tue-def-objection', 'objection', [
    turn('tue-def-objection__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Before Venn gave the hold instruction, what did another dispatcher tell you Venn had said?'),
    turn('tue-def-objection__2', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'objection', 'Objection, Your Honour. Hearsay.'),
    turn('tue-def-objection__3', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'I rely on it only to explain why Dorn turned to the east incident.'),
    turn('tue-def-objection__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'I uphold the objection. The witness must not answer.'),
    turn('tue-def-objection__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Counsel may ask only about words and sounds Dorn personally perceived.'),
  ]),
  cue('tue-def-ruling', 'ruling', [
    turn('tue-def-ruling__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Members of the jury, the unanswered question proves nothing. It must not prompt speculation about what an absent person might have said. Dorn may describe only what she herself heard and saw in the room.'),
  ]),
  cue('tue-dorn-chief-2', 'witness-chief', [
    turn('tue-dorn-chief-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did Kestrel’s status show?'),
    turn('tue-dorn-chief-2__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'It showed ready.'),
    turn('tue-dorn-chief-2__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What instruction did you hear from Mara Venn?'),
    turn('tue-dorn-chief-2__4', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'She told me, “Hold Kestrel. Keep this at priority three.”', [
      ['“Hold Kestrel. Keep this at priority three.”', 'reported', 'accused'],
    ]),
    turn('tue-dorn-chief-2__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Did you ask her to clarify that instruction?'),
    turn('tue-dorn-chief-2__6', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'Yes. I asked whether she meant the east rescue, because people were already in the water there. She said, “No. Seventy-one waits.” Her voice sounded flat, but I cannot tell you from her tone what she intended.', [
      ['“No. Seventy-one waits.”', 'reported', 'accused'],
    ]),
  ]),
  cue('tue-recording-foundation', 'exhibit-admitted', [
    turn('tue-recording-foundation__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise the voices and sequence in this archive copy?'),
    turn('tue-recording-foundation__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'foundation', 'Yes. I recognise the voices and sequence.'),
    turn('tue-recording-foundation__3', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'By agreement, I tender the archive copy. Tovan Mir will later address its digital fingerprint, completeness and clock.'),
    turn('tue-recording-foundation__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'I admit the distress recording provisionally, subject to Mir’s evidence about its digital fingerprint, completeness and clock.'),
    turn('tue-recording-foundation__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'It is not finally admitted. Listen only for what is actually audible, including uncertainty, and do not treat either advocate’s description as evidence.'),
  ], { recordingAdmission: { evidenceId: 'ex-distress', status: 'provisional', operativeTurnId: 'tue-recording-foundation__4', warningTurnId: 'tue-recording-foundation__5' } }),
  cue('tue-recording-play', 'exhibit-admitted', [
    turn('tue-recording-play__1', 'ilan-saye', 'Ilan Saye', 'recording-playback', 'none', 'Lumen to Reach Control. Flooding fast. Beacon Alpha Romeo seven one.'),
    turn('tue-recording-play__2', 'peli-dorn', 'Peli Dorn', 'recording-playback', 'none', 'Stand by for the duty controller.'),
    turn('tue-recording-play__3', 'accused', 'Mara Venn', 'recording-playback', 'none', 'Lumen, confirm seven one.'),
    turn('tue-recording-play__4', 'ilan-saye', 'Ilan Saye', 'recording-playback', 'none', 'Seven one. Pumps lost. One person aboard—'),
    turn('tue-recording-play__5', 'recorded-channel', 'Recorded channel', 'recording-playback', 'exhibit-playback', 'Several seconds of static.'),
    turn('tue-recording-play__6', 'accused', 'Mara Venn', 'recording-playback', 'none', 'A R seventy-one, I have your position. Maintain beacon.'),
    turn('tue-recording-play__7', 'ilan-saye', 'Ilan Saye', 'recording-playback', 'none', 'Water at the batteries.'),
    turn('tue-recording-play__8', 'recorded-channel', 'Recorded channel', 'recording-playback', 'exhibit-playback', 'Transmission breaks.'),
  ]),
  cue('tue-dorn-cross-1', 'witness-cross', [
    turn('tue-dorn-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'You were handling four open incidents?'),
    turn('tue-dorn-cross-1__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'Four were displayed.'),
    turn('tue-dorn-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'Alarms overlapped and the roof link failed twice?'),
    turn('tue-dorn-cross-1__4', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'Yes.'),
    turn('tue-dorn-cross-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'You initially wondered whether Venn meant the east rescue?'),
    turn('tue-dorn-cross-1__6', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'For a moment.'),
    turn('tue-dorn-cross-1__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'So a trained dispatcher beside her could be uncertain about the instruction?'),
    turn('tue-dorn-cross-1__8', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'About which incident, briefly—not about the words “seventy-one waits.”', [['“seventy-one waits.”', 'reported', 'accused']]),
  ]),
  cue('tue-dorn-cross-2', 'witness-cross', [
    turn('tue-dorn-cross-2__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'The room was loud, and you could not see everything on Mara Venn’s screen?'),
    turn('tue-dorn-cross-2__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'That is right. There were alert tones, radio traffic and rain against the windows. I could still hear her at the next console. She looked twice between A R seventy-one and Kestrel’s status. I did not see the maintenance warning detail page open, but I cannot say whether she had opened it earlier.'),
  ]),
  cue('tue-dorn-re-1', 'witness-reexamination', [
    turn('tue-dorn-re-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Cross-examination mentioned the incident involving people already in the water. When you heard Mara Venn say “seventy-one waits,” had a rescue craft been assigned to that incident?', [['“seventy-one waits,”', 'reported', 'accused']]),
    turn('tue-dorn-re-1__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'Yes. Skimmer Two was already moving east.'),
    turn('tue-dorn-re-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Did A R seventy-one then have any craft assigned?'),
    turn('tue-dorn-re-1__4', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'No.'),
    turn('tue-dorn-re-1__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'That evidence was permitted because cross-examination raised the competing rescue.'),
  ], { attributions: [{ marker: 'Mara Venn say', actorId: 'accused', kind: 'reported' }] }),
  cue('tue-re-direction', 'preliminary-direction', [
    turn('tue-re-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Re-examination is confined to matters arising from cross-examination unless the court gives leave. Consider the clarification with all of Dorn’s evidence, including the noise, her momentary confusion and the limits of what she could know about Mara Venn’s state of mind.'),
  ]),
  cue('tue-mir-chief-1', 'exhibit-admitted', [
    turn('tue-mir-chief-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What is your role, and which records did you examine?'),
    turn('tue-mir-chief-1__2', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'I administer the incident archive. I examined the controller audit log, the hourly incident board and the North Station snapshot.'),
    turn('tue-mir-chief-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'How did you check the audit log?'),
    turn('tue-mir-chief-1__4', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'Each controller signs in with a hardware key and personal code. The audit log is stored in an archive that does not permit later changes. Its S H A two fifty-six digital fingerprint matches the fingerprint recorded when the file entered that archive. The archive clock was within two seconds of the station clock.'),
    turn('tue-mir-chief-1__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What sequence does the log record for Mara Venn’s session?'),
    turn('tue-mir-chief-1__6', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'It records acceptance of A R seventy-one at twenty-one sixteen and eight seconds, a downgrade and confirmation, then release of Kestrel at twenty-one twenty-seven and twenty-nine seconds.'),
    turn('tue-mir-chief-1__7', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'How did you check the hourly incident board?'),
    turn('tue-mir-chief-1__8', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'I generated the complete hourly export under the same archive procedure. Its digital fingerprint matches the manifest, which links the North Station snapshot to A R seventy-one.'),
    turn('tue-mir-chief-1__9', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the audit log and hourly incident board export.'),
    turn('tue-mir-chief-1__10', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The audit log and hourly incident board export are admitted.'),
  ]),
  cue('tue-mir-chief-2', 'exhibit-admitted', [
    turn('tue-mir-chief-2__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Where was the yellow launch strip found, and how is it connected to this incident?'),
    turn('tue-mir-chief-2__2', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'It printed automatically when the incident was accepted and was recovered from Mara Venn’s tray. Its incident number and print sequence match the log.'),
    turn('tue-mir-chief-2__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Did you find any sign that the strip had been altered?'),
    turn('tue-mir-chief-2__4', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'No. I examined both sides. The paper and printed fields show no erasure, overwriting or alteration.'),
    turn('tue-mir-chief-2__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise the handwriting?'),
    turn('tue-mir-chief-2__6', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'Yes. In my ordinary records work, I routinely reviewed incident strips completed by Mara Venn before this event. I recognise this as her ordinary handwriting. The entry reads “hold—readiness”. The paper cannot tell us when she wrote it or why.', [['“hold—readiness”', 'written', 'accused']]),
    turn('tue-mir-chief-2__7', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the launch strip.'),
    turn('tue-mir-chief-2__8', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The launch strip is admitted.'),
  ]),
  cue('tue-mir-chief-3', 'witness-chief', [
    turn('tue-mir-chief-3__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'How was the distress recording created?'),
    turn('tue-mir-chief-3__2', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'The console recorded the distress channel automatically.'),
    turn('tue-mir-chief-3__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'How did you check the copy played in court?'),
    turn('tue-mir-chief-3__4', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'I exported it from the incident archive. Its S H A two fifty-six digital fingerprint matches the archived file, so the copy is complete and unedited.'),
    turn('tue-mir-chief-3__5', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'What did you check about the North Station snapshot?'),
    turn('tue-mir-chief-3__6', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'Its digital fingerprint and incident identifier match the archive manifest. The snapshot is complete for that time and shows the status ready exactly as retained. The main tile did not display the separate warning detail.'),
  ]),
  cue('tue-mir-cross-1', 'witness-cross', [
    turn('tue-mir-cross-1__1', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'The confirmation screen used the words “Apply selected priority?”', [['“Apply selected priority?”', 'written']]),
    turn('tue-mir-cross-1__2', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'Yes.'),
    turn('tue-mir-cross-1__3', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'It did not say “Delay may kill”?', [['“Delay may kill”', 'written']]),
    turn('tue-mir-cross-1__4', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'No.'),
    turn('tue-mir-cross-1__5', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'A hardware-key record proves which account acted, not whether another person touched the controls?'),
    turn('tue-mir-cross-1__6', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'Technically yes, though I found no sign of that.'),
    turn('tue-mir-cross-1__7', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'question', 'And the log cannot record panic, mistake or intent?'),
    turn('tue-mir-cross-1__8', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'answer', 'Correct.'),
  ]),
  cue('tue-log-direction', 'preliminary-direction', [
    turn('tue-log-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'The Crown may invite you to infer Venn operated her own authenticated console. The defence may identify the logical limits of that inference. Neither possibility becomes fact merely because counsel mentions it. Ask whether the evidence as a whole excludes a reasonable alternative.'),
  ]),
  cue('tue-recording-final-admission', 'exhibit-admitted', [
    turn('tue-recording-final-admission__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'Mir’s evidence about the archive, the digital fingerprint and the copy satisfies the outstanding condition. The distress recording’s provisional admission is now final. Cross-examination tested what system records can prove about an operator, but did not disturb this file’s integrity.'),
    turn('tue-recording-final-admission__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Use the recording only for what is actually audible and within its stated limitations.'),
  ], { recordingAdmission: { evidenceId: 'ex-distress', status: 'final', operativeTurnId: 'tue-recording-final-admission__1' } }),
  cue('tue-adjourn-1', 'adjournment', [
    turn('tue-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You may replay the admitted distress recording and inspect the exhibits in your juror desk. Counsel’s descriptions are not evidence. Tomorrow you will hear from the rescue supervisor, a medical expert and the compliance director. In particular, causation and alleged motive remain contested.'),
  ]),
  cue('tue-adjourn-2', 'adjournment', [
    turn('tue-adjourn-2__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'All rise. Court is adjourned.'),
    turn('tue-adjourn-2__2', 'narrator', 'Narrator', 'narration', 'narration', 'Save observations rather than a verdict. A useful note distinguishes what the system records from what the record may mean.'),
  ]),
]
