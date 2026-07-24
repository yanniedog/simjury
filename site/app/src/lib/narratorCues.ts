import type { DocketBeat, DocketCase } from './v2/caseSchema'
import cueCopy from './narratorCueCopy.json'

/** Plain-language cues for first-time jurors — on screen and via narrator voice. */

export type PhaseCueId =
  | 'intro'
  | 'openings'
  | 'beats'
  | 'verdict'
  | 'juryroom'
  | 'reveal'

const PHASE_CUES = cueCopy.phaseCues as Record<PhaseCueId, string>

export function phaseNarratorCue(phase: PhaseCueId): string {
  return PHASE_CUES[phase]
}

export function allPhaseNarratorCues(): string[] {
  return Object.values(PHASE_CUES)
}

function speakerOf(trial: DocketCase, id: string) {
  return trial.cast.find((m) => m.id === id)
}

function fillSpeakerTemplate(
  template: string,
  member: { name: string; role_label: string },
): string {
  return template.split('{name}').join(member.name).split('{role}').join(member.role_label)
}

/** First-appearance (or speaker-change) intro for evidence beats. */
export function speakerNarratorCue(
  trial: DocketCase,
  beat: DocketBeat,
): string | null {
  const member = speakerOf(trial, beat.speaker)
  if (!member) return null

  const templates = cueCopy.speaker
  if (beat.kind === 'direction') return fillSpeakerTemplate(templates.direction, member)
  if (beat.kind === 'exhibit') return fillSpeakerTemplate(templates.exhibit, member)
  if (beat.mode === 'cross') return fillSpeakerTemplate(templates.cross, member)
  if (member.side === 'prosecution') {
    return fillSpeakerTemplate(templates.prosecution, member)
  }
  if (member.side === 'defence') {
    return fillSpeakerTemplate(templates.defence, member)
  }
  return fillSpeakerTemplate(templates.fallback, member)
}
