import { describe, expect, it, vi } from 'vitest'
import type { StoredWeeklyProgress } from '../state/progress'
import { courtWeekBootstrap } from './bootstrap'
import { eligibleScheduleEntries, loadEligibleCourtPacks } from './loader'

function progress(completedSessionIds: string[]): StoredWeeklyProgress {
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: 'cw-0001',
    revision: courtWeekBootstrap.revision,
    highestObservedTime: '2026-08-01T00:00:00Z',
    completedSessionIds,
    notes: '',
    reasoningContributions: [],
    majorityDirectionReceived: false,
  }
}

describe('sealed pack network gate', () => {
  it('performs no pack or unlock-module work before Monday court time', async () => {
    const fetcher = vi.fn()
    const beforeMonday = Date.parse('2026-08-10T08:29:59+10:00')
    expect(eligibleScheduleEntries(courtWeekBootstrap, progress([]), beforeMonday)).toEqual([])
    await expect(loadEligibleCourtPacks({
      bootstrap: courtWeekBootstrap,
      progress: progress([]),
      observedNow: beforeMonday,
      baseUrl: '/jury/court-week/packs/',
      fetcher,
    })).resolves.toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
    expect(eligibleScheduleEntries(
      courtWeekBootstrap,
      progress(courtWeekBootstrap.sessions.map((session) => session.id)),
      beforeMonday,
    )).toEqual([])
  })

  it('does not make Tuesday eligible until Monday is complete', () => {
    const afterTuesday = Date.parse('2026-08-11T08:31:00+10:00')
    expect(eligibleScheduleEntries(courtWeekBootstrap, progress([]), afterTuesday).map((entry) => entry.day))
      .toEqual(['Monday'])
    expect(eligibleScheduleEntries(
      courtWeekBootstrap,
      progress(['cw-0001-monday']),
      afterTuesday,
    ).map((entry) => entry.day)).toEqual(['Monday', 'Tuesday'])
  })
})
