import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadWeeklyProgressResult,
  saveWeeklyProgress,
  type StoredWeeklyProgress,
} from './progress'

export interface WeeklyProgressState {
  progress: StoredWeeklyProgress
  archivedProgress: StoredWeeklyProgress[]
  hydrated: boolean
  persistence: 'indexeddb' | 'memory' | 'pending' | 'ephemeral'
  persistenceIssue: PersistenceIssue
  updateProgress: (
    update:
      | StoredWeeklyProgress
      | ((current: StoredWeeklyProgress) => StoredWeeklyProgress),
  ) => void
}

export type PersistenceIssue = 'unavailable' | 'save-failed' | 'corrupt' | 'revision-mismatch' | null

export const WEEKLY_PROGRESS_EVENT = 'simjury:court-week-progress'

export function useWeeklyProgress(
  initialProgress: StoredWeeklyProgress,
  { ephemeral = false }: { ephemeral?: boolean } = {},
): WeeklyProgressState {
  const [progress, setProgress] = useState(initialProgress)
  const [archivedProgress, setArchivedProgress] = useState<StoredWeeklyProgress[]>([])
  const [hydrated, setHydrated] = useState(ephemeral)
  const [persistence, setPersistence] = useState<WeeklyProgressState['persistence']>(
    ephemeral ? 'ephemeral' : 'pending',
  )
  const [persistenceIssue, setPersistenceIssue] = useState<PersistenceIssue>(null)
  const saveSequence = useRef(0)
  const skipHydrationSave = useRef(true)
  const progressRef = useRef(progress)
  const initialProgressRef = useRef(initialProgress)
  const ephemeralResetKey = [
    initialProgress.courtWeekId,
    initialProgress.revision,
    initialProgress.currentSessionId,
    initialProgress.currentSceneId,
    initialProgress.currentCueId,
  ].join('\0')
  progressRef.current = progress
  initialProgressRef.current = initialProgress

  useEffect(() => {
    if (ephemeral) {
      setProgress(initialProgressRef.current)
      setArchivedProgress([])
    }
  }, [ephemeral, ephemeralResetKey])

  useEffect(() => {
    if (ephemeral) return
    let current = true
    void loadWeeklyProgressResult(
      initialProgress.courtWeekId,
      initialProgress.revision,
    ).then(({ progress: stored, archives, issue }) => {
      if (!current) return
      setArchivedProgress(archives)
      if (stored) setProgress(stored)
      if (issue) {
        setPersistence(issue === 'revision-mismatch' ? 'indexeddb' : 'memory')
        setPersistenceIssue(issue)
      } else if (stored) {
        setPersistence('indexeddb')
      }
      setHydrated(true)
    })
    return () => {
      current = false
    }
  }, [ephemeral, initialProgress.courtWeekId, initialProgress.revision])

  useEffect(() => {
    if (!hydrated || ephemeral) return
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
            setPersistenceIssue('save-failed')
          } else {
            setPersistenceIssue((issue) => issue === 'unavailable' || issue === 'save-failed' ? null : issue)
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
  }, [ephemeral, hydrated, progress])

  useEffect(() => {
    if (!hydrated || ephemeral) return
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
  }, [ephemeral, hydrated])

  const updateProgress = useCallback(
    (
      update:
        | StoredWeeklyProgress
        | ((current: StoredWeeklyProgress) => StoredWeeklyProgress),
    ) => setProgress(update),
    [],
  )

  return { progress, archivedProgress, hydrated, persistence, persistenceIssue, updateProgress }
}
