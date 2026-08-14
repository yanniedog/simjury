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
  commitProgressImport: (
    commit: () => Promise<StoredWeeklyProgress>,
  ) => Promise<StoredWeeklyProgress>
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
  const pendingSave = useRef<number | null>(null)
  const importInFlight = useRef(false)
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
    setPersistence('pending')
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      pendingSave.current = null
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
    pendingSave.current = timeout
    return () => {
      window.clearTimeout(timeout)
      if (pendingSave.current === timeout) {
        pendingSave.current = null
        if (!importInFlight.current) void saveWeeklyProgress(progress.courtWeekId, progress)
      }
    }
  }, [ephemeral, hydrated, progress])

  useEffect(() => {
    if (!hydrated || ephemeral) return
    const flushLatest = () => {
      if (importInFlight.current) return
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

  const commitProgressImport = useCallback(async (
    commit: () => Promise<StoredWeeklyProgress>,
  ) => {
    if (ephemeral) throw new Error('Temporary test sessions cannot import saved progress.')
    ++saveSequence.current
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current)
      pendingSave.current = null
    }
    importInFlight.current = true
    setPersistence('pending')
    try {
      const imported = await commit()
      progressRef.current = imported
      setProgress(imported)
      return imported
    } catch (error) {
      const current = progressRef.current
      const destination = await saveWeeklyProgress(current.courtWeekId, current)
      setPersistence(destination)
      if (destination === 'memory') setPersistenceIssue('save-failed')
      throw error
    } finally {
      importInFlight.current = false
    }
  }, [ephemeral])

  return {
    progress, archivedProgress, hydrated, persistence, persistenceIssue,
    updateProgress, commitProgressImport,
  }
}
