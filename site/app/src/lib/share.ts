import { convictionBand } from './game'

/**
 * Placeholder share domain. Set to the real domain before public launch.
 * TODO(launch): point at the production URL.
 */
export const SHARE_URL = 'https://simjury.day'

export interface ShareInput {
  /** 1-based puzzle number (the day index + 1). */
  dayNumber: number
  /** Slider value locked after each beat, in order. */
  convictions: number[]
  correct: boolean
  swayedByTraps: number
  totalTraps: number
  /** Current correct-day streak; shown only when it's worth bragging about (>= 2). */
  currentStreak?: number
  /**
   * The jury room's own result (docket loop). Spoiler-safe by construction:
   * the room's split says nothing about the true verdict or the player's.
   */
  room?: { kind: 'unanimous' | 'majority' | 'hung'; g: number; ng: number }
}

/** One emoji tile for a conviction value — the journey's shape, not its content. */
export function convictionTile(value: number): string {
  switch (convictionBand(value)) {
    case 'lean-innocent':
      return '🟩'
    case 'lean-guilty':
      return '🟥'
    default:
      return '🟨'
  }
}

/**
 * Build the spoiler-safe share text. It deliberately reveals nothing about the
 * case, the charge, the correct verdict, or the player's chosen verdict — only
 * the shape of their conviction and whether they read it right, exactly like a
 * Wordle grid shares the pattern but never the word.
 */
export function buildShareText(
  input: ShareInput,
  url: string = SHARE_URL,
): string {
  const trajectory = input.convictions.map(convictionTile).join('')
  const result = input.correct ? '🎯 Read it right' : '🌀 Got played'
  const lines = [`⚖️ SimJury Daily #${input.dayNumber}`, trajectory, result]

  if (input.totalTraps > 0) {
    const dodged = input.totalTraps - input.swayedByTraps
    lines.push(`🃏 ${dodged}/${input.totalTraps} traps dodged`)
  }

  if (input.room) {
    const split = `${Math.max(input.room.g, input.room.ng)}–${Math.min(input.room.g, input.room.ng)}`
    lines.push(
      input.room.kind === 'hung'
        ? `🏛️ My jury hung ${split}`
        : `🏛️ My jury: ${split}${input.room.kind === 'unanimous' ? ' unanimous' : ''}`,
    )
  }

  if (input.currentStreak !== undefined && input.currentStreak >= 2) {
    lines.push(`🔥 ${input.currentStreak}-day streak`)
  }

  lines.push(`Could you catch it? ${url}`)
  return lines.join('\n')
}
