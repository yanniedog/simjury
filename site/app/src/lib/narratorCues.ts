import type { DocketBeat, DocketCase } from './v2/caseSchema'

/** Plain-language cues for first-time jurors — on screen and via narrator voice. */

export type PhaseCueId =
  | 'intro'
  | 'openings'
  | 'beats'
  | 'verdict'
  | 'juryroom'
  | 'reveal'

const PHASE_CUES: Record<PhaseCueId, string> = {
  intro:
    'This is the briefing. You will meet the person on trial and learn the charge. Listen for what the prosecution must prove — you decide later if they proved it.',
  openings:
    'Now you will hear openings. Each side tells its story of the case before any evidence is called. Notice what each side asks you to believe.',
  beats:
    'Now the evidence. Witnesses and exhibits come one at a time. You do not decide yet — just listen carefully.',
  verdict:
    'Now you decide. After the closings, choose guilty or not guilty. To convict, you must be sure beyond reasonable doubt.',
  juryroom:
    'Now you explain your reasons to the other jurors. Your verdict is already sealed — this is where you defend what persuaded you.',
  reveal:
    'This is the record. See how your verdict compares with the case outcome, and which pieces of evidence the authors marked as decisive.',
}

export function phaseNarratorCue(phase: PhaseCueId): string {
  return PHASE_CUES[phase]
}

function speakerOf(trial: DocketCase, id: string) {
  return trial.cast.find((m) => m.id === id)
}

/** First-appearance (or speaker-change) intro for evidence beats. */
export function speakerNarratorCue(
  trial: DocketCase,
  beat: DocketBeat,
): string | null {
  const member = speakerOf(trial, beat.speaker)
  if (!member) return null

  const name = member.name
  const role = member.role_label

  if (beat.kind === 'direction') {
    return `This is ${name}, ${role}. They will remind you of the legal rules that bind your decision.`
  }

  if (beat.kind === 'exhibit') {
    return `This is an exhibit, introduced by ${name}. Look at what it shows — and what it does not prove by itself.`
  }

  if (beat.mode === 'cross') {
    return `This is cross-examination of ${name}. The other side will test their account. Listen for what holds up and what wobbles.`
  }

  if (member.side === 'prosecution') {
    return `This is ${name}, ${role}. Their job is to help prove the charge. Listen for the key facts they put forward.`
  }

  if (member.side === 'defence') {
    return `This is ${name}, ${role}. Their job is to raise doubt about the charge. Listen for the gaps they point out.`
  }

  return `This is ${name}, ${role}.`
}
