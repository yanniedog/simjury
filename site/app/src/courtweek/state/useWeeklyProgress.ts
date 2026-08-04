import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadWeeklyProgressResult,
  saveWeeklyProgress,
  type StoredWeeklyProgress,
} from './progress'

export interface WeeklyProgressState {
  progress: StoredWeeklyProgress
  hydrated: boolean
  persistence: 'indexeddb' | 'memory' | 'pending'
  persistenceNotice: string | null
  updateProgress: (
    update:
      | StoredWeeklyProgress
      | ((current: StoredWeeklyProgress) => StoredWeeklyProgress),
  ) => void
}

export const WEEKLY_PROGRESS_EVENT = 'simjury:court-week-progress'

export function useWeeklyProgress(
  initialProgress: StoredWeeklyProgress,
): WeeklyProgressState {
  const [progress, setProgress] = useState(initialProgress)
  const [hydrated, setHydrated] = useState(false)
  const [persistence, setPersistence] = useState<WeeklyProgressState['persistence']>('pending')
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null)
  const saveSequence = useRef(0)
  const skipHydrationSave = useRef(true)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    let current = true
    void loadWeeklyProgressResult(initialProgress.courtWeekId).then(({ progress: stored, issue }) => {
      if (!current) return
      const incompatible = stored && stored.revision !== initialProgress.revision
      if (stored && !incompatible) setProgress(stored)
      if (incompatible) {
        setPersistence('memory')
        setPersistenceNotice('Saved progress belongs to a different case revision and was not loaded. A new session has started.')
      } else if (issue) {
        setPersistence('memory')
        setPersistenceNotice(issue === 'corrupt'
          ? 'Saved progress is damaged and could not be recovered. A new session has started; export it if you need a separate copy.'
          : 'Device storage is unavailable. Progress is held in this tab; export it before leaving.')
      } else if (stored) {
        setPersistence('indexeddb')
      }
      setHydrated(true)
    })
    return () => {
      current = false
    }
  }, [initialProgress.courtWeekId, initialProgress.revision])

  useEffect(() => {
    if (!hydrated) return
    window.dispatchEvent(new CustomEvent<StoredWeeklyProgress>(
      WEEKLY_PROGRESS_EVENT,
      { detail: progress },
    ))
    if (skipHydrationSave.current) {
      skipHydrationSave.current = false
      return
    }
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      void saveWeeklyProgress(progress.courtWeekId, progress).then((destination) => {
        if (sequence === saveSequence.current) {
          setPersistence(destination)
          if (destination === 'memory') {
            setPersistenceNotice('Device storage could not save progress. Progress is held in this tab; export it before leaving.')
          } else {
            setPersistenceNotice((notice) => notice?.startsWith('Device storage') ? null : notice)
          }
        }
      })
    }, 120)
    return () => {
      window.clearTimeout(timeout)
      // Flush immediately on unmount so a day-boundary remount cannot lose the
      // just-recorded completion still sitting in the 120 ms debounce window.
      void saveWeeklyProgress(progress.courtWeekId, progress)
    }
  }, [hydrated, progress])

  useEffect(() => {
    if (!hydrated) return
    const flushLatest = () => {
      const latest = progressRef.current
      void saveWeeklyProgress(latest.courtWeekId, latest)
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushLatest()
    }
    window.addEventListener('pagehide', flushLatest)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flushLatest)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [hydrated])

  const updateProgress = useCallback(
    (
      update:
        | StoredWeeklyProgress
        | ((current: StoredWeeklyProgress) => StoredWeeklyProgress),
    ) => setProgress(update),
    [],
  )

  return { progress, hydrated, persistence, persistenceNotice, updateProgress }
}
