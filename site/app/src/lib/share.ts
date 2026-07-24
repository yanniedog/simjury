export const SHARE_URL = 'https://simjury.com/today/'

export interface ShareInput {
  /** 1-based puzzle number (the day index + 1). */
  dayNumber: number
  /** Current participation streak; shown only after a return visit (>= 2). */
  currentStreak?: number
  /**
   * The jury room's own result (docket loop). Spoiler-safe by construction:
   * the room's split says nothing about the true verdict or the player's.
   */
  room?: { kind: 'unanimous' | 'majority' | 'hung'; g: number; ng: number }
}

/**
 * Build the spoiler-safe share text. It deliberately reveals nothing about the
 * case, charge, authored outcome, or player's verdict — only the room split.
 */
export function buildShareText(
  input: ShareInput,
  url: string = SHARE_URL,
): string {
  const lines = [`⚖️ SimJury Daily #${input.dayNumber}`]

  if (input.room) {
    const split = `${Math.max(input.room.g, input.room.ng)}–${Math.min(input.room.g, input.room.ng)}`
    lines.push(
      input.room.kind === 'hung'
        ? `🏛️ My jury hung ${split}`
        : `🏛️ My jury: ${split}${input.room.kind === 'unanimous' ? ' unanimous' : ''}`,
    )
  }

  if (input.currentStreak !== undefined && input.currentStreak >= 2) {
    lines.push(`🗓️ ${input.currentStreak} daily sittings in a row`)
  }

  lines.push(`What would you decide? ${url}`)
  return lines.join('\n')
}
