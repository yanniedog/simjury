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
    turn('tue-resume-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Yesterday you heard the allegation, the dispatch duty and limited route evidence. Recall evidence as best you can, but do not invent exact words. Today you may hear a recording. Its evidentiary status and any limits will be stated before it is played. If it is admitted and later made available for replay, repetition does not give it extra legal weight.'),
  ]),
  cue('tue-resume-2', 'preliminary-direction', [
    turn('tue-resume-2__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You will also hear evidence about simultaneous incidents. A busy room can explain an error, yet busyness is not a universal excuse. Ask what information reached this controller, what action she took and what reasonable alternatives then existed.'),
  ]),
  cue('tue-dorn-chief-1', 'witness-chief', [
    turn('tue-dorn-chief-1__1', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'I took the first words of the call. The channel crackled, but I heard “survey vessel Lumen, beacon AR-71, taking water.” I transferred it to Venn. She leaned toward the speaker. When the caller repeated the beacon, I heard Venn answer, “AR-71, I have your position.” I entered flooding as the incident type.', [
      ['“survey vessel Lumen, beacon AR-71, taking water.”', 'reported', 'ilan-saye'],
      ['“AR-71, I have your position.”', 'reported', 'accused'],
    ]),
  ], { attributions: [{ marker: 'Venn answer', actorId: 'accused', kind: 'reported' }] }),
  cue('tue-def-objection', 'objection', [
    turn('tue-def-objection__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Before Venn gave the hold instruction, what did another dispatcher tell you Venn had said?'),
    turn('tue-def-objection__2', 'defence-counsel', 'Defence counsel Corin Dax', 'live-proceeding', 'objection', 'Objection—hearsay.'),
    turn('tue-def-objection__3', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'submission', 'It may explain the noise in the room.'),
    turn('tue-def-objection__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', 'Sustained. The witness must not answer.'),
    turn('tue-def-objection__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Ask only about words and sounds Dorn personally perceived.'),
  ]),
  cue('tue-def-ruling', 'ruling', [
    turn('tue-def-ruling__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Members of the jury, the unanswered question proves nothing. It must not prompt speculation about what an absent person might have said. Dorn may describe only the room she perceived herself.'),
  ]),
  cue('tue-dorn-chief-2', 'witness-chief', [
    turn('tue-dorn-chief-2__1', 'peli-dorn', 'Peli Dorn', 'reported-testimony', 'answer', 'Kestrel showed READY. Venn told me, “Hold Kestrel. Keep this at priority three.” I asked whether she meant the east rescue, because that involved people already in the water. She said, “No. Seventy-one waits.” Her voice was flat. I cannot tell you from tone alone what she intended.', [
      ['“Hold Kestrel. Keep this at priority three.”', 'reported', 'accused'],
      ['“No. Seventy-one waits.”', 'reported', 'accused'],
    ]),
  ], { attributions: [{ marker: 'Venn told me', actorId: 'accused', kind: 'reported' }] }),
  cue('tue-recording-foundation', 'exhibit-admitted', [
    turn('tue-recording-foundation__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Do you recognise the voices and sequence in this archive copy?'),
    turn('tue-recording-foundation__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'foundation', 'Yes. I recognise the voices and sequence.'),
    turn('tue-recording-foundation__3', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'By agreement, I tender the archive copy. Mir will later address its hash, completeness and clock.'),
    turn('tue-recording-foundation__4', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The distress recording is admitted provisionally, subject to Mir’s evidence about its hash, completeness and clock.'),
    turn('tue-recording-foundation__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'It is not finally admitted. Listen only for what is actually audible, including uncertainty, and do not treat either advocate’s description as evidence.'),
  ], { recordingAdmission: { evidenceId: 'ex-distress', status: 'provisional', operativeTurnId: 'tue-recording-foundation__4', warningTurnId: 'tue-recording-foundation__5' } }),
  cue('tue-recording-play', 'exhibit-admitted', [
    turn('tue-recording-play__1', 'ilan-saye', 'Ilan Saye', 'recording-playback', 'none', 'Lumen to Reach control. Flooding fast. Beacon Alpha-Romeo seven-one.'),
    turn('tue-recording-play__2', 'peli-dorn', 'Peli Dorn', 'recording-playback', 'none', 'Stand by for duty.'),
    turn('tue-recording-play__3', 'accused', 'Mara Venn', 'recording-playback', 'none', 'Lumen, confirm seven-one.'),
    turn('tue-recording-play__4', 'ilan-saye', 'Ilan Saye', 'recording-playback', 'none', 'Seven-one. Pumps lost. One person aboard—'),
    turn('tue-recording-play__5', 'recorded-channel', 'Recorded channel', 'recording-playback', 'exhibit-playback', 'Several seconds of static.'),
    turn('tue-recording-play__6', 'accused', 'Mara Venn', 'recording-playback', 'none', 'AR-71, I have your position. Maintain beacon.'),
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
    turn('tue-dorn-cross-2__1', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'The room was loud: alert tones, radio traffic and rain against the glazing. I could still hear Venn at the next console. She looked twice between AR-71 and Kestrel’s status. I did not see the maintenance-warning detail page open. I cannot say whether she had opened it earlier.'),
  ]),
  cue('tue-dorn-re-1', 'witness-reexamination', [
    turn('tue-dorn-re-1__1', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Cross-examination mentioned the people-in-water incident. When you heard Venn answer “seventy-one waits,” had a rescue craft been assigned there?', [['“seventy-one waits,”', 'reported', 'accused']]),
    turn('tue-dorn-re-1__2', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'Yes. Skimmer Two was already moving east.'),
    turn('tue-dorn-re-1__3', 'crown-counsel', 'Crown counsel Asha Renn', 'live-proceeding', 'question', 'Did AR-71 then have any craft assigned?'),
    turn('tue-dorn-re-1__4', 'peli-dorn', 'Peli Dorn', 'live-proceeding', 'answer', 'No.'),
    turn('tue-dorn-re-1__5', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'That clarification is admitted only because cross-examination raised the competing rescue.'),
  ], { attributions: [{ marker: 'Venn answer', actorId: 'accused', kind: 'reported' }] }),
  cue('tue-re-direction', 'preliminary-direction', [
    turn('tue-re-direction__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'Re-examination is not a second opening. It may clarify a matter arising from cross-examination and may not introduce an unrelated case. Evaluate the answer with all of Dorn’s evidence, including noise, momentary confusion and her inability to speak to Venn’s mind.'),
  ]),
  cue('tue-mir-chief-1', 'exhibit-admitted', [
    turn('tue-mir-chief-1__1', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'Each controller signs in with a hardware key and personal code. This audit log’s SHA-256 hash matches the write-once archive, whose clock was within two seconds of the station clock. Venn’s session accepted AR-71 at 21:16:08, downgraded and confirmed it, then released Kestrel at 21:27:29. I generated the complete hourly incident-board export under the same archive procedure; its hash matches the manifest, which also links the North Station snapshot to AR-71.'),
    turn('tue-mir-chief-1__2', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the audit log and hourly incident-board export.'),
    turn('tue-mir-chief-1__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The audit log and hourly incident-board export are admitted.'),
  ]),
  cue('tue-mir-chief-2', 'exhibit-admitted', [
    turn('tue-mir-chief-2__1', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'The yellow strip printed automatically upon acceptance and was recovered from Venn’s tray. Its incident number and print sequence match the log. I examined both sides; the paper and printed fields show no erasure, overwriting or alteration. In my ordinary records work, I routinely reviewed incident strips Venn completed before this event. I recognise the handwriting as her ordinary hand. It says “hold—readiness,” but the paper cannot tell us when she wrote it or why.', [['“hold—readiness,”', 'written', 'accused']]),
    turn('tue-mir-chief-2__2', 'crown-counsel', 'Crown counsel Asha Renn', 'advocacy', 'tender', 'I tender the launch strip.'),
    turn('tue-mir-chief-2__3', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'The launch strip is admitted.'),
  ]),
  cue('tue-mir-chief-3', 'witness-chief', [
    turn('tue-mir-chief-3__1', 'tovan-mir', 'Tovan Mir', 'live-proceeding', 'foundation', 'The console automatically recorded the distress channel. I exported the copy played here from the write-once incident archive; its SHA-256 hash matches the archived file, so the copy is complete and unedited. The North Station snapshot’s digest and incident identifier also match the archive manifest. It is complete for that timestamp and shows READY exactly as retained, but the main tile did not display the separate warning detail.'),
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
    turn('tue-recording-final-admission__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'admission', 'Mir’s archive, hash and copy evidence satisfies the outstanding condition. The distress recording’s provisional admission is now final. Cross-examination tested what system records can prove about an operator, but did not disturb this file’s integrity.'),
    turn('tue-recording-final-admission__2', 'judge', 'Judge Sel Aven', 'judicial-direction', 'limitation-direction', 'Use the recording only for what is actually audible and within its stated limitations.'),
  ], { recordingAdmission: { evidenceId: 'ex-distress', status: 'final', operativeTurnId: 'tue-recording-final-admission__1' } }),
  cue('tue-adjourn-1', 'adjournment', [
    turn('tue-adjourn-1__1', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You may replay the admitted distress recording and inspect the exhibits in your juror desk. Do not replay counsel’s descriptions as though they were evidence. Tomorrow you will hear from the rescue supervisor, a medical expert and the compliance director. In particular, causation and alleged motive remain contested.'),
  ]),
  cue('tue-adjourn-2', 'adjournment', [
    turn('tue-adjourn-2__1', 'court-officer', 'Court officer', 'live-proceeding', 'none', 'Save observations, not a verdict. A useful note distinguishes what the system records from what that record might mean. Court is adjourned.'),
  ]),
]
