// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearMemoryProgressForTests,
  loadWeeklyProgress,
  type StoredWeeklyProgress,
} from './progress'
import {
  useWeeklyProgress,
  WEEKLY_PROGRESS_EVENT,
  type WeeklyProgressState,
} from './useWeeklyProgress'

const initialProgress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: '2026.08.03-r2',
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
    expect(state?.persistenceIssue).toBe('unavailable')

    act(() => state?.updateProgress((current) => ({
      ...current,
      currentCueId: 'mon-arrival-2',
      notes: 'Latest private note.',
    })))
    expect(state?.persistence).toBe('pending')
    act(() => window.dispatchEvent(new Event('pagehide')))

    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toMatchObject({
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

    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toMatchObject({
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

  it('prevents a pending save from overwriting a confirmed import', async () => {
    function Harness() {
      state = useWeeklyProgress(initialProgress)
      return null
    }
    const imported: StoredWeeklyProgress = {
      ...initialProgress,
      currentSessionId: 'cw-0001-tuesday',
      currentSceneId: 'tue-dispatcher',
      currentCueId: 'tue-dispatcher-1',
      notes: 'Imported private note.',
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    await act(async () => { await Promise.resolve() })
    act(() => state?.updateProgress((current) => ({ ...current, notes: 'Stale local draft.' })))
    await act(async () => { await expect(state!.commitProgressImport(async () => { throw new Error('Import failed.') })).rejects.toThrow('Import failed.') })
    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toMatchObject({ notes: 'Stale local draft.' })
    clearMemoryProgressForTests()

    let resolveImport!: (progress: StoredWeeklyProgress) => void
    let importPromise!: Promise<StoredWeeklyProgress>
    act(() => {
      importPromise = state!.commitProgressImport(() => new Promise((resolve) => { resolveImport = resolve }))
    })
    act(() => window.dispatchEvent(new Event('pagehide')))
    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toBeNull()

    await act(async () => {
      resolveImport(imported)
      await importPromise
    })
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toMatchObject(imported)
    act(() => root.unmount())
  })

  it('keeps ephemeral preview progress entirely in React memory', async () => {
    let progressEvents = 0
    const receiveProgress = () => { progressEvents += 1 }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, receiveProgress)
    function Harness() {
      state = useWeeklyProgress(initialProgress, { ephemeral: true })
      return null
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    expect(state?.hydrated).toBe(true)
    expect(state?.persistence).toBe('ephemeral')

    act(() => state?.updateProgress((current) => ({ ...current, notes: 'Discard me.' })))
    act(() => window.dispatchEvent(new Event('pagehide')))
    await new Promise((resolve) => window.setTimeout(resolve, 150))

    expect(progressEvents).toBe(0)
    await expect(loadWeeklyProgress('cw-0001', '2026.08.03-r2')).resolves.toBeNull()
    act(() => root.unmount())
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, receiveProgress)
  })

  it('resets ephemeral state when the selected preview position changes', async () => {
    let supplied = initialProgress
    function Harness() {
      state = useWeeklyProgress(supplied, { ephemeral: true })
      return null
    }
    const root = createRoot(container)
    await act(async () => root.render(<Harness />))
    act(() => state?.updateProgress((current) => ({ ...current, notes: 'Discard me.' })))

    supplied = {
      ...initialProgress,
      currentSessionId: 'cw-0001-tuesday',
      currentSceneId: 'tue-dispatcher',
      currentCueId: 'tue-dispatcher-1',
    }
    await act(async () => root.render(<Harness />))

    expect(state?.progress).toMatchObject({
      currentSessionId: 'cw-0001-tuesday',
      currentSceneId: 'tue-dispatcher',
      currentCueId: 'tue-dispatcher-1',
      notes: '',
    })
    act(() => root.unmount())
  })
})
