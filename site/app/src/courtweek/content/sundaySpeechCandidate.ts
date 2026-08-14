import type { Agreement } from '../engine/deliberation'
import type { CourtEvent, Verdict } from '../model/schema'
import type {
  ActorId,
  LegalAction,
  ReviewedSpeechCue,
  SpeechMode,
  SpokenTurn,
} from './speechReview'

export const SUNDAY_SOURCE_CUE_IDS = [
  'sun-resume-1', 'sun-resume-2', 'sun-negligence-1', 'sun-negligence-2',
  'sun-second-ballot', 'sun-ballot-reflect', 'sun-perseverance',
  'sun-further-discussion', 'sun-majority-direction', 'sun-majority-limit',
  'sun-final-review', 'sun-final-ballot', 'sun-verdict-return',
  'sun-verdict-confirm', 'sun-analysis', 'sun-analysis-close',
] as const

export const SUNDAY_DYNAMIC_SOURCE_CUE_IDS = [
  'sun-verdict-return', 'sun-verdict-confirm', 'sun-analysis',
] as const

export type SundaySourceCueId = typeof SUNDAY_SOURCE_CUE_IDS[number]
export type SundayProcedureStage =
  | 'resumed-deliberation' | 'second-unanimity-ballot' | 'perseverance-direction'
  | 'further-deliberation' | 'fresh-unanimity-ballot' | 'majority-direction'
  | 'final-majority-capable-ballot' | 'completion'
export type SundayGuard =
  | 'always' | 'second-ballot-divided'
  | 'fresh-ballot-divided-and-legal-timing-satisfied' | 'after-return'

export const SUNDAY_BALLOT_BRANCHES = {
  secondBallotUnanimous: ['sun-second-ballot', 'open-court-return'],
  freshBallotUnanimous: [
    'sun-second-ballot', 'sun-perseverance', 'sun-further-discussion',
    'sun-fresh-unanimity-ballot', 'open-court-return',
  ],
  freshBallotDividedAfterLegalTiming: [
    'sun-second-ballot', 'sun-perseverance', 'sun-further-discussion',
    'sun-fresh-unanimity-ballot', 'sun-majority-direction',
    'sun-final-ballot', 'open-court-return',
  ],
} as const

export interface SundayProcedureCandidate extends ReviewedSpeechCue {
  sourceCueId: SundaySourceCueId | null
  event: CourtEvent
  procedureStage: SundayProcedureStage
  guard: SundayGuard
}

export interface SundayReturnCandidate extends ReviewedSpeechCue {
  sourceCueIds: readonly ['sun-verdict-return', 'sun-verdict-confirm']
  verdict: Verdict
  agreement: Agreement
}

export interface SundayAnalysisCandidate extends ReviewedSpeechCue {
  sourceCueId: 'sun-analysis'
  verdict: Verdict
  threshold: string
  lawfulRationale: string
  counterAnalysis: string
}

function turn(
  id: string, actorId: ActorId, displayLabel: string, speechMode: SpeechMode,
  legalAction: LegalAction, text: string,
): SpokenTurn {
  return { id, actorId, displayLabel, speechMode, legalAction, text }
}

function procedure(
  sourceCueId: SundaySourceCueId | null, event: CourtEvent,
  procedureStage: SundayProcedureStage, guard: SundayGuard, actorId: ActorId,
  displayLabel: string, speechMode: SpeechMode, legalAction: LegalAction, text: string,
): SundayProcedureCandidate {
  const id = sourceCueId ?? 'sun-fresh-unanimity-ballot'
  const turns = [turn(id + '__1', actorId, displayLabel, speechMode, legalAction, text)]
  return { id, sourceCueId, event, procedureStage, guard, turns, sourceText: text }
}

/** Inactive review source: no active session, pack, digest or media code imports it. */
export const SUNDAY_PROCEDURE_CANDIDATE: readonly SundayProcedureCandidate[] = [
  procedure('sun-resume-1', 'jury-discussion', 'resumed-deliberation', 'always', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'none', 'We resume with the judge’s answer: possible risk is not murderous intent. That may move a person away from murder without deciding manslaughter or acquittal. We will revisit each offence in sequence. No one should announce that a changed view proves weakness; responsible reconsideration is part of deliberation.'),
  procedure('sun-resume-2', 'jury-discussion', 'resumed-deliberation', 'always', 'yara-merrow', 'Yara Merrow', 'live-proceeding', 'none', 'The judge’s answer removes a shortcut from possible harm to intent; it does not erase the Crown case. The exact beacon, hold, confirmation and eleven minutes may support intent to cause death or really serious injury. Permanent logging, release, warning and overload point the other way. I now test which inference is the only reasonable one.'),
  procedure('sun-negligence-1', 'jury-discussion', 'resumed-deliberation', 'always', 'lina-fei', 'Lina Fei', 'live-proceeding', 'none', 'For manslaughter, the warning cannot simply disappear. The question is whether holding for eleven minutes while advice was available, then launching under the same warning, departed so greatly from reasonable care that it was criminal. The unchanged condition can support that inference, but we still need causation.'),
  procedure('sun-negligence-2', 'jury-discussion', 'resumed-deliberation', 'always', 'ari-tem', 'Ari Tem', 'live-proceeding', 'none', 'Manslaughter is not a midpoint. The unchanged warning may support grossness. Genuine rescuer risk, hidden detail and alarm saturation point against finding a deliberate breach so far below reasonable care, with so high a risk, that it merits criminal punishment. Reasonable doubt on causation or grossness defeats both offences.'),
  procedure('sun-second-ballot', 'second-ballot', 'second-unanimity-ballot', 'always', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'ballot-administration', 'After today’s resumed discussion, each juror will vote privately again. No individual position will be exposed. If all twelve agree, we return to court. If not, I report only that unanimity has not been reached. More than eight court hours have elapsed, but neither fact changes the standard or by itself authorises a majority verdict.'),
  procedure('sun-ballot-reflect', 'jury-discussion', 'second-unanimity-ballot', 'second-ballot-divided', 'omri-cade', 'Omri Cade', 'live-proceeding', 'none', 'Before asking the judge for help, let us state the live disagreement precisely. Some accept medical causation and criminal negligence but not intent. Others consider the same-outcome possibility reasonable. A smaller view says the sequence excludes innocent error and proves murder. Those are legal disagreements, not stubborn personalities.'),
  procedure('sun-perseverance', 'perseverance-direction', 'perseverance-direction', 'second-ballot-divided', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'I understand you have not agreed. Return and make one further honest effort. Listen to reasons you may have misunderstood and re-examine your own, but no juror must surrender an honestly held view merely to obtain a verdict. The burden and elements do not change with time. If genuine disagreement remains, you must say so.'),
  procedure('sun-further-discussion', 'jury-discussion', 'further-deliberation', 'second-ballot-divided', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'none', 'We comply by testing one proposition from the minority and one from the largest group. We do not ask anyone to defend being outnumbered. The court clock advances transparently while we recheck the recording, warning, log, expert limits and element trail.'),
  procedure(null, 'second-ballot', 'fresh-unanimity-ballot', 'second-ballot-divided', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'ballot-administration', 'We have completed further deliberation after the judge’s perseverance direction. We now take a fresh private ballot seeking unanimity; the earlier ballot is not reused. Each juror votes independently. If all twelve agree, we return to court. If divided, I report only that fact so the judge can decide whether a majority direction is legally available.'),
  procedure('sun-majority-direction', 'majority-direction', 'majority-direction', 'fresh-ballot-divided-and-legal-timing-satisfied', 'judge', 'Judge Sel Aven', 'judicial-direction', 'direction', 'You have deliberated for more than eight hours. Your second private ballot did not produce unanimity. After my perseverance direction, you undertook further deliberation and a fresh private unanimity ballot, which also did not produce unanimity. I am satisfied it is appropriate to accept a verdict on which eleven jurors agree. Continue first to seek unanimity. If that is not honestly possible, an eleven-to-one verdict may be returned. No smaller majority is lawful.'),
  procedure('sun-majority-limit', 'jury-discussion', 'majority-direction', 'fresh-ballot-divided-and-legal-timing-satisfied', 'kessa-noor', 'Kessa Noor', 'live-proceeding', 'none', 'This direction changes the number needed for a verdict, not the elements or anyone’s duty to decide honestly. It does not tell a lone juror to submit or the eleven to stop listening. If neither unanimity nor eleven-to-one forms, unable to agree remains a lawful result.'),
  procedure('sun-final-review', 'jury-discussion', 'final-majority-capable-ballot', 'fresh-ballot-divided-and-legal-timing-satisfied', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'none', 'Before the final ballot, apply the path once more: murder first; manslaughter only if murder fails; Not Guilty if an element of both remains unproved; unable to agree if honest discussion cannot produce unanimity or eleven-to-one. Do not select the verdict you predict others will choose.'),
  procedure('sun-final-ballot', 'final-ballot', 'final-majority-capable-ballot', 'fresh-ballot-divided-and-legal-timing-satisfied', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'ballot-administration', 'Each of you now marks one final position in private. Do not reveal it until the ballots are collected. I will report only whether all twelve agree, eleven agree under the judge’s direction, or no lawful agreement exists. No juror is asked to abandon an honest view, and no seat is identified.'),
  procedure('sun-analysis-close', 'analysis', 'completion', 'after-return', 'narrator', 'Narrator', 'narration', 'narration', 'Your week is complete. The case remains available for catch-up and review, but your sealed first and final votes remain part of your private local record. Nothing is uploaded to a court, server, leaderboard or other player.'),
]

function returned(
  id: string, verdict: Verdict, agreement: Agreement, forepersonText: string, judgeText: string,
): SundayReturnCandidate {
  const turns = [
    turn(id + '__narrator', 'narrator', 'Narrator', 'narration', 'narration', 'The jury returns to the courtroom. Mara Venn stands.'),
    turn(id + '__clerk', 'clerk', 'Clerk', 'live-proceeding', 'verdict-question', 'Foreperson, has the jury reached a verdict?'),
    turn(id + '__foreperson', 'edda-rook', 'Foreperson Edda Rook', 'live-proceeding', 'verdict-return', forepersonText),
    turn(id + '__judge', 'judge', 'Judge Sel Aven', 'judicial-direction', 'ruling', judgeText),
  ]
  return { id, sourceCueIds: ['sun-verdict-return', 'sun-verdict-confirm'], verdict, agreement, turns, sourceText: turns.map(({ text }) => text).join(' ') }
}

export const SUNDAY_RETURN_CANDIDATES: readonly SundayReturnCandidate[] = [
  returned('sun-return-murder-unanimous', 'murder', 'unanimous', 'Guilty of murder, unanimously.', 'The court records the verdict as returned.'),
  returned('sun-return-murder-majority', 'murder', 'majority', 'Guilty of murder, by an authorised eleven-to-one majority.', 'The court records the verdict as returned.'),
  returned('sun-return-manslaughter-unanimous', 'manslaughter', 'unanimous', 'Guilty of manslaughter by criminal negligence, unanimously.', 'The court records the verdict as returned.'),
  returned('sun-return-manslaughter-majority', 'manslaughter', 'majority', 'Guilty of manslaughter by criminal negligence, by an authorised eleven-to-one majority.', 'The court records the verdict as returned.'),
  returned('sun-return-not-guilty-unanimous', 'not-guilty', 'unanimous', 'Not Guilty, unanimously.', 'The court records the verdict as returned.'),
  returned('sun-return-not-guilty-majority', 'not-guilty', 'majority', 'Not Guilty, by an authorised eleven-to-one majority.', 'The court records the verdict as returned.'),
  returned('sun-return-unable-to-agree-hung', 'unable-to-agree', 'hung', 'We are unable to agree.', 'I discharge the jury without criticism.'),
]

function analysis(
  verdict: Verdict, threshold: string, lawfulRationale: string, counterAnalysis: string,
): SundayAnalysisCandidate {
  const id = 'sun-analysis-' + verdict
  const turns = [
    turn(id + '__lawful', 'narrator', 'Narrator', 'narration', 'narration', 'Strongest lawful rationale: ' + lawfulRationale),
    turn(id + '__counter', 'narrator', 'Narrator', 'narration', 'narration', 'Strongest counter-analysis: ' + counterAnalysis),
  ]
  return { id, sourceCueId: 'sun-analysis', verdict, threshold, lawfulRationale, counterAnalysis, turns, sourceText: turns.map(({ text }) => text).join(' ') }
}

export const SUNDAY_ANALYSIS_CANDIDATES: readonly SundayAnalysisCandidate[] = [
  analysis('murder', 'All murder elements proved beyond reasonable doubt, with unanimity or an authorised eleven-to-one majority.', 'Recognition of AR-71, the express hold, authenticated downgrade and confirmation, available clarification, unchanged later launch, duration and Venn’s expressed fear that Saye’s unfinished review threatened her career may together exclude safety error and support the sole reasonable inference that Venn intended death or really serious injury. Vos’s bounded probability, tested against its ordinary-route and uninterrupted-travel assumptions and read with the conscious last transmission, may prove the omission substantially caused death.', 'The genuine warning, overloaded room and accepted error mechanism leave a reasonable non-murderous explanation. The memorandum was unfinished and unseen, and Venn’s question did not prove she knew its recommendation. The survival model concedes a same-outcome possibility. A deliberate hold and indifference to risk are not necessarily intent to harm.'),
  analysis('manslaughter', 'Murderous intent is not proved, but every s 22 element is proved beyond reasonable doubt with the lawful numerical agreement.', 'The jury may reject intent to harm yet find a deliberate and criminally grave failure: Venn recognised the alert, withheld the nearest launch-capable craft while AR-71 had no craft assigned, left it waiting for eleven minutes while clarification was available, and then launched under the same non-grounding warning. The expert evidence may prove that omission materially caused death.', 'Criminal negligence is not a compromise label for a bad outcome. The warning carried genuine rescuer risk, the interface obscured detail, and causation remains probabilistic. If either the grossness threshold or causation remains reasonably doubtful, manslaughter is not proved.'),
  analysis('not-guilty', 'At least one required element of murder and manslaughter remains unproved beyond reasonable doubt.', 'The Crown cannot use silence to fill its gaps. A conscious console action does not establish intent to harm, and the warning plus alarm saturation supports an evidence-based error or safety-assessment possibility. Vos could not exclude an earlier but still fatal outcome, so causation may remain reasonably doubtful for both offences.', 'The alternatives must be reasonable on the whole evidence, not merely conceivable. Recognition, explicit words, authenticated confirmation, the eleven-minute hold and unchanged later launch may contradict an honest safety assessment, while the last conscious transmission and expert model may sufficiently establish causation without certainty.'),
  analysis('unable-to-agree', 'After honest consideration, neither unanimity nor an authorised eleven-to-one agreement is reached on any lawful verdict.', 'Reasonable jurors can conscientiously differ over the boundary between probability and reasonable doubt, and between a grave intentional hold, criminal negligence and murderous intent. A hung jury is a lawful result when the prescribed numerical threshold is not honestly reached.', 'Jurors must not use inability to agree as a refuge from difficult analysis. Before reporting disagreement, they must test assumptions, address the judge’s answer and reconsider competing evidence-linked reasons without surrendering honest judgment.'),
]
