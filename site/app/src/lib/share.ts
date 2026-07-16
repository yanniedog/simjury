import { convictionBand } from './game'

export const SHARE_URL = 'https://simjury.com/today/'

export interface ShareInput {
  /** 1-based puzzle number (the day index + 1). */
  dayNumber: number
  /** Slider value locked after each beat, in order. */
  convictions: number[]
  /** Current participation streak; shown only after a return visit (>= 2). */
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
 * case, charge, authored outcome, or player's verdict. It shares the shape of
 * their thinking and the fictional room's split, not a win or loss.
 */
export function buildShareText(
  input: ShareInput,
  url: string = SHARE_URL,
): string {
  const trajectory = input.convictions.map(convictionTile).join('')
  const lines = [`⚖️ SimJury Daily #${input.dayNumber}`, trajectory]

  if (input.room) {
    const split = `${Math.max(input.room.g, input.room.ng)}–${Math.min(input.room.g, input.room.ng)}`
    lines.push(
      input.room.kind === 'hung'
        ? `🏛️ My fictional jury hung ${split}`
        : `🏛️ My fictional jury: ${split}${input.room.kind === 'unanimous' ? ' unanimous' : ''}`,
    )
  }

  if (input.currentStreak !== undefined && input.currentStreak >= 2) {
    lines.push(`🗓️ ${input.currentStreak} daily sittings in a row`)
  }

  lines.push(`What would you decide? ${url}`)
  return lines.join('\n')
}
