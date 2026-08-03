import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredWeeklyProgress } from './progress'
import {
  clearMemoryProgressForTests,
  exportWeeklyProgress,
  importWeeklyProgress,
  loadWeeklyProgress,
  saveWeeklyProgress,
} from './progress'

const progress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: '2026.08.03-r1',
  highestObservedTime: '2026-08-10T08:30:00+10:00',
  completedSessionIds: ['mon'],
  currentSessionId: 'tue',
  currentSceneId: 'tue-scene-1',
  currentCueId: 'tue-cue-1',
  notes: 'Check the warning record.',
  accessibilityMode: 'captions',
}

describe('weekly progress', () => {
  beforeEach(() => clearMemoryProgressForTests())

  it('falls back to in-memory persistence when IndexedDB is unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    try {
      await expect(saveWeeklyProgress('cw-0001', progress)).resolves.toBe('memory')
      await expect(loadWeeklyProgress('cw-0001')).resolves.toEqual(progress)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
      else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    }
  })

  it('exports access preferences while omitting private notes by default', () => {
    const exported = exportWeeklyProgress(progress)
    expect(exported).toContain('"accessibilityMode": "captions"')
    expect(exported).not.toContain('Check the warning record.')
    expect(importWeeklyProgress(exported, 'cw-0001', '2026.08.03-r1')).toEqual({
      ...progress,
      notes: '',
    })
  })

  it('rejects progress from a different case revision', () => {
    expect(() => importWeeklyProgress(
      exportWeeklyProgress(progress, true),
      'cw-0001',
      '2026.08.03-r2',
    )).toThrow('different case revision')
  })
})
