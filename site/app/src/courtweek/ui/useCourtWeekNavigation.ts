import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { CourtSession, CourtWeek, SceneCue } from '../model/schema'
import { nextAuthoredCue } from '../content/captionPacing'
import { isReplaySuppressedCue, nextReplaySafeCue } from '../engine/replay'
import type { AccessMode, StoredWeeklyProgress } from '../state/progress'
import type { WeeklyProgressState } from '../state/useWeeklyProgress'

interface CourtPosition {
  sceneIndex: number
  scene: CourtSession['scenes'][number]
  cueIndex: number
  cue: SceneCue
}

interface CourtWeekNavigationOptions {
  accessMode: AccessMode
  activeSession: CourtSession
  courtWeekSessions: CourtWeek['manifest']['sessions']
  deskOpen: boolean
  isReplay: boolean
  position: CourtPosition
  progress: StoredWeeklyProgress
  setReplaySessionId: Dispatch<SetStateAction<string | null>>
  setStarted: Dispatch<SetStateAction<boolean>>
  updateProgress: WeeklyProgressState['updateProgress']
}

export function useCourtWeekNavigation({
  accessMode,
  activeSession,
  courtWeekSessions,
  deskOpen,
  isReplay,
  position,
  progress,
  setReplaySessionId,
  setStarted,
  updateProgress,
}: CourtWeekNavigationOptions) {
  const advanceBlocked = useRef(false)
  const interactionReturnFocus = useRef<HTMLElement | null>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [interactionChoice, setInteractionChoice] = useState<string | null>(null)
  const [interactionSealed, setInteractionSealed] = useState(false)
  const [reasoningQuestion, setReasoningQuestion] = useState('')
  const [reasoningEvidence, setReasoningEvidence] = useState('')
  const [reasoningBasis, setReasoningBasis] = useState('')

  const resetInteraction = useCallback(() => {
    setInteractionOpen(false)
    setInteractionChoice(null)
    setInteractionSealed(false)
    setReasoningQuestion('')
    setReasoningEvidence('')
    setReasoningBasis('')
  }, [])

  const commitPosition = useCallback((
    sessionId: string,
    sceneId: string,
    cueId: string,
    traversedCueId?: string,
  ) => {
    updateProgress((current) => ({
      ...current,
      ...(traversedCueId === 'sun-majority-direction' ? { majorityDirectionReceived: true } : {}),
      ...(traversedCueId === 'sun-verdict-return' && current.sealedVerdict && current.sealedAgreement
        ? {
            openCourtVerdictReturned: true,
            returnedVerdict: current.sealedVerdict,
            returnedAgreement: current.sealedAgreement,
          }
        : {}),
      currentSessionId: sessionId,
      currentSceneId: sceneId,
      currentCueId: cueId,
    }))
  }, [updateProgress])

  const advance = useCallback((trigger?: HTMLElement) => {
    // A mandatory interaction is a hard legal-state boundary. Stale media
    // completion or programmatic control events must not traverse beneath it.
    if (advanceBlocked.current || interactionOpen || deskOpen) return
    const nextCue = accessMode === 'reading'
      ? nextAuthoredCue(
        position.scene.cues,
        position.cueIndex,
        isReplay ? isReplaySuppressedCue : () => false,
      )
      : nextReplaySafeCue(position.scene.cues, position.cueIndex, isReplay)
    if (nextCue) {
      commitPosition(activeSession.id, position.scene.id, nextCue.id, isReplay ? undefined : position.cue.id)
      return
    }
    if (position.scene.interaction?.kind !== 'observe' && position.scene.interaction && !interactionOpen) {
      advanceBlocked.current = true
      interactionReturnFocus.current = trigger ?? (
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      )
      setInteractionOpen(true)
      return
    }
    const nextScene = activeSession.scenes[position.sceneIndex + 1]
    if (nextScene) {
      setInteractionOpen(false)
      setInteractionChoice(null)
      setInteractionSealed(false)
      commitPosition(activeSession.id, nextScene.id, nextScene.cues[0].id, isReplay ? undefined : position.cue.id)
      return
    }
    if (isReplay) {
      setReplaySessionId(null)
      setStarted(false)
      setInteractionOpen(false)
      setInteractionChoice(null)
      setInteractionSealed(false)
      return
    }
    const completed = Array.from(new Set([...progress.completedSessionIds, activeSession.id]))
    const nextSession = courtWeekSessions[activeSession.ordinal]
    updateProgress((current) => ({
      ...current,
      completedSessionIds: completed,
      currentSessionId: nextSession?.id,
      currentSceneId: nextSession?.scenes[0]?.id,
      currentCueId: nextSession?.scenes[0]?.cues[0]?.id,
    }))
    setStarted(false)
    setInteractionOpen(false)
    setInteractionChoice(null)
    setInteractionSealed(false)
  }, [
    accessMode, activeSession, commitPosition, courtWeekSessions, deskOpen,
    interactionOpen, isReplay, position, progress.completedSessionIds,
    setReplaySessionId, setStarted, updateProgress,
  ])

  return {
    advance,
    advanceBlocked,
    commitPosition,
    interactionChoice,
    interactionOpen,
    interactionReturnFocus,
    interactionSealed,
    reasoningBasis,
    reasoningEvidence,
    reasoningQuestion,
    resetInteraction,
    setInteractionChoice,
    setInteractionOpen,
    setInteractionSealed,
    setReasoningBasis,
    setReasoningEvidence,
    setReasoningQuestion,
  }
}
