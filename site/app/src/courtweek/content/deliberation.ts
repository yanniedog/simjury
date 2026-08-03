import type { DeliberationPack } from '../model/schema'

export const elevenMinutesDeliberation: DeliberationPack = {
  jurors: [
    { id: 'juror-01', name: 'Edda Rook', occupation: 'Library coordinator', concern: 'Whether deliberate delay proves an intention to cause death or really serious injury', reasoningStrength: 'Keeps the room on the ordered element trail', vulnerability: 'Can overvalue tidy documentary sequences' },
    { id: 'juror-02', name: 'Niko Pell', occupation: 'Ferry mechanic', concern: 'Whether the medical evidence excludes a reasonable same-outcome possibility', reasoningStrength: 'Tests expert assumptions against physical evidence', vulnerability: 'Can demand scientific certainty beyond the criminal standard' },
    { id: 'juror-03', name: 'Lina Fei', occupation: 'Disability support planner', concern: 'What READY and the steering warning reasonably communicated together', reasoningStrength: 'Holds competing facts without collapsing them into a slogan', vulnerability: 'Can give precautionary explanations too much benefit' },
    { id: 'juror-04', name: 'Ari Tem', occupation: 'Payroll auditor', concern: 'The inference from authenticated actions to state of mind', reasoningStrength: 'Separates direct records from inferential claims', vulnerability: 'Can mistake documentary precision for completeness' },
    { id: 'juror-05', name: 'Sola Iven', occupation: 'Emergency nurse', concern: 'The express words “seventy-one waits” and their practical urgency', reasoningStrength: 'Recognises the human meaning of emergency language', vulnerability: 'Can let the fatal outcome colour the earlier decision' },
    { id: 'juror-06', name: 'Bram Tey', occupation: 'Interface designer', concern: 'Whether the display design left a reasonable error mechanism', reasoningStrength: 'Understands how labels and hidden detail influence action', vulnerability: 'Can elevate a general design risk into a case-specific diagnosis' },
    { id: 'juror-07', name: 'Kessa Noor', occupation: 'Community mediator', concern: 'Whether the room is applying the burden without demanding a defence explanation', reasoningStrength: 'Detects coercion and burden shifting', vulnerability: 'Can treat any imaginable alternative as reasonable' },
    { id: 'juror-08', name: 'Daro Sen', occupation: 'Warehouse scheduler', concern: 'What the length and sequence of the hold add to the inference', reasoningStrength: 'Reconstructs timelines carefully', vulnerability: 'Can count repeated time markers as independent proof' },
    { id: 'juror-09', name: 'Yara Voss', occupation: 'Information-security analyst', concern: 'Why an intentional wrongdoer would create permanent account records', reasoningStrength: 'Tests the Crown theory for operational coherence', vulnerability: 'Can assume wrongdoing always follows a sophisticated concealment plan' },
    { id: 'juror-10', name: 'Toma Reed', occupation: 'Retired deck officer', concern: 'Whether launch risk and ordinary route assumptions were realistic in the storm', reasoningStrength: 'Connects operational evidence without inventing technical facts', vulnerability: 'Can substitute personal maritime expectations for trial evidence' },
    { id: 'juror-11', name: 'Omri Cade', occupation: 'Secondary-school teacher', concern: 'Whether disagreement is about law, source reliability or competing inference', reasoningStrength: 'Restates opposing arguments fairly before testing them', vulnerability: 'Can delay commitment while seeking an impossible perfect formulation' },
  ],
  legalQuestions: [
    'Did Mara Venn intentionally fail to perform the accepted-alert duty without reasonably prioritising a greater imminent peril?',
    'Did that omission substantially and operatively cause Ilan Saye’s death beyond reasonable doubt?',
    'Did Venn intend death or really serious injury, making the offence murder?',
    'If murder is not proved, was the deliberate duty breach so gross and the risk so high that it was manslaughter by criminal negligence?',
  ],
  reasoningMoves: ['connect', 'distinguish', 'test-source', 'challenge-inference', 'raise-alternative', 'apply-burden'],
  improperArguments: [
    { claim: 'An innocent accused would have testified.', correction: 'The accused has an absolute right to silence. It supplies no evidence and cannot strengthen the Crown case.', influencePenalty: -2 },
    { claim: 'The likely sentence is too harsh or too lenient.', correction: 'Punishment is exclusively for the court and is irrelevant to whether an offence is proved.', influencePenalty: -2 },
    { claim: 'The victim deserves a conviction because the death was preventable.', correction: 'Sympathy cannot establish duty breach, causation or intent; each element remains subject to proof beyond reasonable doubt.', influencePenalty: -2 },
    { claim: 'The struck office rumour shows Venn had done this before.', correction: 'The volunteered hearsay was struck and is legally absent for character, propensity, motive and every other purpose.', influencePenalty: -3 },
    { claim: 'Manslaughter is the fair midpoint between murder and acquittal.', correction: 'Manslaughter is a separate offence whose own duty, causation and criminal-negligence elements must all be proved.', influencePenalty: -2 },
  ],
  juryNote: {
    question: 'For murder, if we find the controller deliberately held the craft while aware that death was a possible result, is awareness of that risk enough to prove the required intent? Please restate the difference between murder and manslaughter.',
    answer: 'No. Awareness that death or serious injury was possible does not by itself establish an intention to cause death or really serious injury under s 18. If murder is not proved, s 22 separately requires a deliberate duty breach that caused death and was such a great departure from reasonable care, with such a high risk of death or serious injury, that it merits criminal punishment.',
  },
  firstBallot: { murder: 3, manslaughter: 3, 'not-guilty': 4, 'unable-to-agree': 1 },
  majorityGate: { minimumElapsedCourtHours: 8.25, requiresFailedUnanimity: true, requiresFurtherDiscussion: true, threshold: 11 },
  outcomePaths: [
    {
      verdict: 'murder', threshold: 'All murder elements proved beyond reasonable doubt, with unanimity or an authorised eleven-to-one majority.',
      lawfulRationale: 'Recognition of AR-71, the express hold, authenticated downgrade and confirmation, available clarification, unchanged later launch, duration and proved knowledge of the audit may together exclude safety error and support the sole reasonable inference that Venn intended death or really serious injury. Vos’s bounded probability, read with the conscious last transmission and uneventful launch route, may prove the omission substantially caused death.',
      counterAnalysis: 'The genuine warning, overloaded room and accepted error mechanism leave a reasonable non-murderous explanation. The audit was unfinished and unseen, while the survival model concedes a same-outcome possibility. A deliberate hold and indifference to risk are not necessarily intent to harm.',
    },
    {
      verdict: 'manslaughter', threshold: 'Murderous intent is not proved, but every s 22 element is proved beyond reasonable doubt with the lawful numerical agreement.',
      lawfulRationale: 'The jury may reject intent to harm yet find a deliberate and criminally grave failure: Venn recognised the alert, withheld the only unassigned nearest craft, made no clarification call, and launched eleven minutes later under the same non-grounding warning. The expert evidence may prove that omission materially caused death.',
      counterAnalysis: 'Criminal negligence is not a compromise label for a bad outcome. The warning carried genuine rescuer risk, the interface obscured detail, and causation remains probabilistic. If either the grossness threshold or causation remains reasonably doubtful, manslaughter is not proved.',
    },
    {
      verdict: 'not-guilty', threshold: 'At least one required element of murder and manslaughter remains unproved beyond reasonable doubt.',
      lawfulRationale: 'The Crown cannot use silence to fill its gaps. A conscious console action does not establish intent to harm, and the warning plus alarm saturation supports an evidence-based error or safety-assessment possibility. Vos could not exclude an earlier but still fatal outcome, so causation may remain reasonably doubtful for both offences.',
      counterAnalysis: 'The alternatives must be reasonable on the whole evidence, not merely conceivable. Recognition, explicit words, confirmation, absence of inquiry and unchanged later launch may contradict an honest safety assessment, while the last conscious transmission and expert model may sufficiently establish causation without certainty.',
    },
    {
      verdict: 'unable-to-agree', threshold: 'After honest consideration, neither unanimity nor an authorised eleven-to-one agreement is reached on any lawful verdict.',
      lawfulRationale: 'Reasonable jurors can conscientiously differ over the boundary between probability and reasonable doubt, and between a grave intentional hold, criminal negligence and murderous intent. A hung jury is a lawful result when the prescribed numerical threshold is not honestly reached.',
      counterAnalysis: 'Jurors must not use inability to agree as a refuge from difficult analysis. Before reporting disagreement, they must test assumptions, address the judge’s answer and reconsider competing evidence-linked reasons without surrendering honest judgment.',
    },
  ],
}
