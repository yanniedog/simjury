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
    correct: true,
    swayedByTraps: 0,
    totalTraps: 2,
  }

  it('renders the day number, trajectory, result, traps, and url', () => {
    const text = buildShareText(base, 'https://example.test')
    expect(text).toBe(
      [
        '⚖️ SimJury Daily #42',
        '🟥🟨🟩',
        '🎯 Read it right',
        '🃏 2/2 traps dodged',
        'Could you catch it? https://example.test',
      ].join('\n'),
    )
  })

  it('shows the played result without leaking the verdict', () => {
    const text = buildShareText({ ...base, correct: false, swayedByTraps: 1 })
    expect(text).toContain('🌀 Got played')
    expect(text).toContain('🃏 1/2 traps dodged')
    // Spoiler-safety: nothing that names the answer.
    expect(text).not.toMatch(/guilty/i)
  })

  it('omits the trap line when the case has no traps', () => {
    const text = buildShareText({ ...base, totalTraps: 0, swayedByTraps: 0 })
    expect(text).not.toContain('🃏')
  })

  it('brags a streak of 2+ but stays quiet below that', () => {
    expect(buildShareText({ ...base, currentStreak: 3 })).toContain(
      '🔥 3-day streak',
    )
    expect(buildShareText({ ...base, currentStreak: 1 })).not.toContain('🔥')
    expect(buildShareText(base)).not.toContain('🔥')
  })
})
