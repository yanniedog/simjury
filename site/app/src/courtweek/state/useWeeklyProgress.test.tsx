// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearMemoryProgressForTests,
  loadWeeklyProgress,
  type StoredWeeklyProgress,
} from './progress'
import { useWeeklyProgress, type WeeklyProgressState } from './useWeeklyProgress'

const initialProgress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: '2026.08.03-r1',
  highestObservedTime: '2026-08-10T08:30:00+10:00',
  completedSessionIds: [],
  currentSessionId: 'cw-0001-monday',
  currentSceneId: 'mon-arrival',
  currentCueId: 'mon-arrival-1',
  notes: '',
}

describe('useWeeklyProgress durability boundaries', () => {
  let container: HTMLDivElement
  let state: WeeklyProgressState | undefined
  let indexedDbDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    clearMemoryProgressForTests()
    indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    container.remove()
    if (indexedDbDescriptor) Object.defineProperty(globalThis, 'indexedDB', indexedDbDescriptor)
    else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
  })

  it('flushes the latest progress before page restoration can discard the debounce', async () => {
    function Harness() {
      state = useWeeklyProgress(initialProgress)
      return null
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    await act(async () => { await Promise.resolve() })
    expect(state?.hydrated).toBe(true)

    act(() => state?.updateProgress((current) => ({
      ...current,
      currentCueId: 'mon-arrival-2',
      notes: 'Latest private note.',
    })))
    act(() => window.dispatchEvent(new Event('pagehide')))

    await expect(loadWeeklyProgress('cw-0001')).resolves.toMatchObject({
      currentCueId: 'mon-arrival-2',
      notes: 'Latest private note.',
    })
    act(() => root.unmount())
  })

  it('flushes the latest progress when the document becomes hidden', async () => {
    function Harness() {
      state = useWeeklyProgress(initialProgress)
      return null
    }
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    await act(async () => { await Promise.resolve() })
    expect(state?.hydrated).toBe(true)

    act(() => state?.updateProgress((current) => ({
      ...current,
      currentCueId: 'mon-arrival-3',
      notes: 'Hidden-state private note.',
    })))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect(loadWeeklyProgress('cw-0001')).resolves.toMatchObject({
      currentCueId: 'mon-arrival-3',
      notes: 'Hidden-state private note.',
    })
    act(() => root.unmount())
    if (visibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', visibilityDescriptor)
    } else {
      Reflect.deleteProperty(document, 'visibilityState')
    }
  })
})
