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

export function useWeeklyProgress(
  initialProgress: StoredWeeklyProgress,
): WeeklyProgressState {
  const [progress, setProgress] = useState(initialProgress)
  const [hydrated, setHydrated] = useState(false)
  const [persistence, setPersistence] = useState<WeeklyProgressState['persistence']>('pending')
  const saveSequence = useRef(0)

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
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      void saveWeeklyProgress(progress.courtWeekId, progress).then((destination) => {
        if (sequence === saveSequence.current) setPersistence(destination)
      })
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [hydrated, progress])

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
