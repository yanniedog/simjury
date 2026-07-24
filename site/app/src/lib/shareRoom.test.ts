import { describe, expect, it } from 'vitest'
import { buildShareText } from './share'

const base = {
  dayNumber: 3,
  convictions: [40, 30],
}

describe('share text room line', () => {
  it('adds a spoiler-safe room split', () => {
    const text = buildShareText({ ...base, room: { kind: 'hung', g: 7, ng: 5 } })
    expect(text).toContain('🏛️ My jury hung 7–5')
    // Still no verdict words anywhere.
    expect(text.toLowerCase()).not.toContain('guilt')
  })

  it('marks a unanimous room', () => {
    const text = buildShareText({
      ...base,
      room: { kind: 'unanimous', g: 0, ng: 12 },
    })
    expect(text).toContain('🏛️ My jury: 12–0 unanimous')
  })

  it('omits the line when the loop has no room', () => {
    expect(buildShareText(base)).not.toContain('🏛️')
  })
})
