import { describe, expect, it } from 'vitest'
import {
  formatCourtUnlock,
  getSessionAvailability,
  observeCourtTime,
} from './schedule'

const sessions = [
  { id: 'mon', unlockAt: '2026-08-10T08:30:00+10:00', prerequisites: [] },
  { id: 'tue', unlockAt: '2026-08-11T08:30:00+10:00', prerequisites: ['mon'] },
]

describe('court week schedule', () => {
  it('requires both court time and sequential completion', () => {
    const beforeTuesday = Date.parse('2026-08-11T08:29:59+10:00')
    expect(getSessionAvailability(sessions, ['mon'], beforeTuesday)).toEqual([
      expect.objectContaining({ id: 'mon', unlocked: true, ready: true }),
      expect.objectContaining({ id: 'tue', unlocked: false, ready: false }),
    ])

    const afterTuesday = Date.parse('2026-08-11T08:30:01+10:00')
    expect(getSessionAvailability(sessions, [], afterTuesday)[1]).toEqual(
      expect.objectContaining({ unlocked: true, ready: false, missingPrerequisites: ['mon'] }),
    )
    expect(getSessionAvailability(sessions, ['mon'], afterTuesday)[1]).toEqual(
      expect.objectContaining({ unlocked: true, ready: true }),
    )
  })

  it('never moves its observed court clock backwards', () => {
    expect(observeCourtTime(200, 100)).toBe(200)
    expect(observeCourtTime(200, 300)).toBe(300)
  })

  it('describes the fixed Hobart court time', () => {
    expect(formatCourtUnlock(sessions[0].unlockAt, 'en-AU')).toMatch(/Monday.*8:30.*AEST/i)
  })
})
