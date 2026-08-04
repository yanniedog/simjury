import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadWeeklyProgress,
  saveWeeklyProgress,
  type StoredWeeklyProgress,
} from './progress'

export interface WeeklyProgressState {
  progress: StoredWeeklyProgress
  hydrated: boolean
  persistence: 'indexeddb' | 'memory' | 'pending'
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
  const saveSequence = useRef(0)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    let current = true
    void loadWeeklyProgress(initialProgress.courtWeekId).then((stored) => {
      if (!current) return
      if (stored?.revision === initialProgress.revision) setProgress(stored)
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
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      void saveWeeklyProgress(progress.courtWeekId, progress).then((destination) => {
        if (sequence === saveSequence.current) setPersistence(destination)
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

  return { progress, hydrated, persistence, updateProgress }
}
