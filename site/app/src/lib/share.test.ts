import { describe, expect, it } from 'vitest'
import { buildShareText, convictionTile } from './share'

describe('convictionTile', () => {
  it('maps conviction bands to colour tiles', () => {
    expect(convictionTile(10)).toBe('🟩')
    expect(convictionTile(50)).toBe('🟨')
    expect(convictionTile(90)).toBe('🟥')
  })
})

describe('buildShareText', () => {
  const base = {
    dayNumber: 42,
    convictions: [70, 40, 20],
  }

  it('renders the day number, trajectory, invitation, and url', () => {
    const text = buildShareText(base, 'https://example.test')
    expect(text).toBe(
      [
        '⚖️ SimJury Daily #42',
        '🟥🟨🟩',
        'What would you decide? https://example.test',
      ].join('\n'),
    )
  })

  it('does not grade the juror or leak the verdict', () => {
    const text = buildShareText(base)
    expect(text).not.toMatch(/right|wrong|played|trap/i)
    expect(text).not.toMatch(/guilty/i)
  })

  it('shares a participation streak of 2+ but stays quiet below that', () => {
    expect(buildShareText({ ...base, currentStreak: 3 })).toContain(
      '🗓️ 3 daily sittings in a row',
    )
    expect(buildShareText({ ...base, currentStreak: 1 })).not.toContain('🗓️')
    expect(buildShareText(base)).not.toContain('🗓️')
  })
})
