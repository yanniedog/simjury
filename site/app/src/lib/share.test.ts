import { describe, expect, it } from 'vitest'
import { buildShareText } from './share'

describe('buildShareText', () => {
  const base = {
    dayNumber: 42,
  }

  it('renders the day number, invitation, and url', () => {
    const text = buildShareText(base, 'https://example.test')
    expect(text).toBe(
      [
        '⚖️ SimJury Daily #42',
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
