import type { Theme } from './v2/caseSchema'

/**
 * Player-facing names for the closed theme enum.
 *
 * The engine keys juror weights and beat tags by slug (`digital_forensics`),
 * and until now those slugs leaked into player-visible copy through a bare
 * underscore-to-space transform. A juror dossier has to say what a person
 * actually cares about in the words a juror would use, so the labels live here
 * as fixed, reviewed copy — no runtime generation, no real-world references.
 */
export const THEME_LABEL: Record<Theme, string> = {
  identity: 'who did it',
  alibi: 'where the accused was',
  digital_forensics: 'what the records show',
  motive: 'reason to do it',
  opportunity: 'the chance to do it',
  method: 'how it was done',
  timeline: 'the order of events',
  credibility: 'whether a witness can be believed',
  procedure: 'how the investigation was run',
  burden: 'who has to prove what',
  knowledge: 'what the accused knew',
  intent: 'what the accused meant to do',
  causation: 'what actually caused the harm',
  duress: 'whether they were forced',
  command: 'who gave the instruction',
  coercion: 'pressure put on someone',
}

export function themeLabel(theme: Theme): string {
  return THEME_LABEL[theme] ?? theme.replace(/_/g, ' ')
}

/** Join theme labels into a readable clause: "a, b and c". */
export function themeList(themes: readonly Theme[]): string {
  const labels = themes.map(themeLabel)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
