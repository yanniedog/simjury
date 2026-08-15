import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CourtWeek, CourtSession, LegalPhase, ReasoningMove, SceneCue, Verdict } from '../model/schema'
import {
  assessReasoningContribution,
  calculateFinalBallot,
  calculateSecondBallot,
  firstBallotForScene,
  nextSundaySceneId,
  runtimeOpenCourtReturnCue,
  runtimeOutcomeAnalysisCue,
  unanimousVerdict,
} from '../engine/deliberation'
import {
  joinAuthoredCueText,
  nextAuthoredCue,
} from '../content/captionPacing'
import { attachCueTurns } from '../content/cueTurns'
import { isReplaySuppressedCue, nextReplaySafeCue, replaySafeCue } from '../engine/replay'
import { deriveEvidenceLedger } from '../engine/evidenceLedger'
import { contributionStage, reasoningMoveLabels } from '../model/deliberationContract'
import { useCuePlayback } from '../media/useCuePlayback'
import {
  getSessionAvailability,
  observeCourtTime,
  formatCourtUnlock,
} from '../state/schedule'
import {
  type AccessMode,
  type StoredWeeklyProgress,
  downloadWeeklyProgress,
  mergeImportedWeeklyProgress,
} from '../state/progress'
import { useWeeklyProgress, type PersistenceIssue } from '../state/useWeeklyProgress'
import { COURT_WEEK_TEST_HARNESS_ENABLED } from '../testHarness'
import { EvidenceViewer } from './EvidenceViewer'
import { CourtSheet } from './CourtSheet'
import { CourtWeekCompletion } from './CourtWeekCompletion'
import { CourtWeekEntry, type CourtWeekEntryProps } from './CourtWeekEntry'
import { ImmersiveCourtShell } from './ImmersiveCourtShell'
import { JurorDesk, type PreparedProgressImport } from './JurorDesk'
import { courtAdvanceAction, interactionPrimaryAction } from './proceduralActions'
import { useCourtWeekNavigation } from './useCourtWeekNavigation'
import '../courtweek.css'

export interface CourtWeekAppProps {
  courtWeek: CourtWeek
  now?: () => number
  releaseBase?: string
  prepareProgressImport?: (
    text: string,
    current: StoredWeeklyProgress,
  ) => Promise<PreparedProgressImport>
  initialProgressOverride?: StoredWeeklyProgress
  ephemeral?: boolean
  ephemeralAdvisory?: string
  focusEntryHeading?: boolean
  entryBusy?: boolean
  testSession?: {
    selectedOrdinal: number
    sessions: Array<{ ordinal: number; day: string }>
    onSelect: (ordinal: number) => void
    onLeave: () => void
  }
  onEnteredChange?: (entered: boolean) => void
  onAccessModeChange?: (mode: AccessMode) => void
  localProfile?: CourtWeekEntryProps['localProfile']
}
const verdictLabels: Record<Verdict, string> = {
  murder: 'Guilty of murder',
  manslaughter: 'Guilty of manslaughter by criminal negligence',
  'not-guilty': 'Not Guilty',
  'unable-to-agree': 'Unable to agree',
}
const legalPhaseLabels: Record<LegalPhase, string> = {
  arrival: 'Opening formalities',
  'crown-case': 'Crown case',
  'defence-case': 'Defence case',
  addresses: 'Closing addresses',
  directions: 'Judge’s directions',
  deliberation: 'Jury deliberation',
  verdict: 'Verdict return',
  analysis: 'Completion review',
}
const improperBasisLabels = [
  'Rely on the accused’s silence',
  'Consider the likely sentence',
  'Decide from sympathy or personal feeling',
  'Rely on character or material the judge excluded',
  'Use manslaughter as a compromise midpoint',
] as const

function improperBasisToken(index: number): string {
  return `improper:${index}`
}
function persistenceNotice(issue: PersistenceIssue): string | null {
  switch (issue) {
    case 'corrupt': return 'Saved progress is damaged and could not be recovered. A new session has started; export it if you need a separate copy.'
    case 'revision-mismatch': return 'A previous record belongs to an earlier case revision. This revised trial has started cleanly; no ballot or evidentiary conclusion was carried forward. Review or export the archived record below.'
    case 'unavailable': return 'Device storage is unavailable. Progress is held in this tab; export it before leaving.'
    case 'save-failed': return 'Device storage could not save progress. Progress is held in this tab; export it before leaving.'
    case null: return null
    default: {
      const unreachable: never = issue
      return unreachable
    }
  }
}
function initialProgress(courtWeek: CourtWeek, now: number): StoredWeeklyProgress {
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: courtWeek.manifest.id,
    revision: courtWeek.manifest.revision,
    highestObservedTime: new Date(now).toISOString(),
    completedSessionIds: [],
    currentSessionId: courtWeek.manifest.sessions[0]?.id,
    currentSceneId: courtWeek.manifest.sessions[0]?.scenes[0]?.id,
    currentCueId: courtWeek.manifest.sessions[0]?.scenes[0]?.cues[0]?.id,
    notes: '',
    reasoningContributions: [],
    majorityDirectionReceived: false,
    openCourtVerdictReturned: false,
  }
}
function cuePosition(session: CourtSession, sceneId?: string, cueId?: string) {
  const sceneIndex = Math.max(0, session.scenes.findIndex((scene) => scene.id === sceneId))
  const scene = session.scenes[sceneIndex] ?? session.scenes[0]
  const cueIndex = Math.max(0, scene.cues.findIndex((cue) => cue.id === cueId))
  return { sceneIndex, scene, cueIndex, cue: scene.cues[cueIndex] ?? scene.cues[0] }
}
function hasResumableProgress(courtWeek: CourtWeek, progress: StoredWeeklyProgress): boolean {
  const firstSession = courtWeek.manifest.sessions[0]
  const firstScene = firstSession?.scenes[0]
  const firstCue = firstScene?.cues[0]
  const firstSittingLoaded = !firstScene?.id.startsWith('sealed-')
  const authoredSceneId = progress.currentSceneId?.startsWith('sealed-') ? undefined : progress.currentSceneId
  const authoredCueId = progress.currentCueId?.startsWith('sealed-') ? undefined : progress.currentCueId
  return Boolean(
    progress.hasEnteredCourt ||
    progress.completedSessionIds.length > 0 ||
    Boolean(progress.currentSessionId && progress.currentSessionId !== firstSession?.id) ||
    Boolean(firstSittingLoaded && authoredSceneId && authoredSceneId !== firstScene?.id) ||
    Boolean(firstSittingLoaded && authoredCueId && authoredCueId !== firstCue?.id) ||
    progress.notes ||
    progress.provisionalVote ||
    progress.secondVote ||
    progress.finalVote ||
    progress.sealedVerdict ||
    progress.returnedVerdict ||
    progress.reasoningContributions?.length,
  )
}
function VerdictChoices({
  selected,
  disabled = false,
  onSelect,
}: {
  selected?: Verdict
  disabled?: boolean
  onSelect: (verdict: Verdict) => void
}) {
  return (
    <div className="cw-verdict-grid">
      {(Object.keys(verdictLabels) as Verdict[]).map((verdict) => (
        <button
          key={verdict}
          type="button"
          aria-pressed={selected === verdict}
          disabled={disabled}
          onClick={() => onSelect(verdict)}
        >
          {verdictLabels[verdict]}
        </button>
      ))}
    </div>
  )
}
export function CourtWeekApp({
  courtWeek,
  now = Date.now,
  releaseBase,
  prepareProgressImport,
  initialProgressOverride,
  ephemeral = false,
  ephemeralAdvisory,
  focusEntryHeading = false,
  entryBusy = false,
  testSession,
  onEnteredChange,
  onAccessModeChange,
  localProfile,
}: CourtWeekAppProps) {
  const baseline = useMemo(
    () => initialProgressOverride ?? initialProgress(courtWeek, now()),
    [courtWeek, initialProgressOverride, now],
  )
  const {
    progress, archivedProgress, hydrated, storageUpgradeBlocked, persistence, persistenceIssue,
    updateProgress, commitProgressImport,
  } = useWeeklyProgress(
    baseline,
    { ephemeral },
  )
  const highestObservedTime = useRef(progress.highestObservedTime)
  if (Date.parse(progress.highestObservedTime) > Date.parse(highestObservedTime.current)) {
    highestObservedTime.current = progress.highestObservedTime
  }
  const storageNotice = ephemeral ? null : persistenceNotice(persistenceIssue)
  const [entered, setEntered] = useState(false)
  const [started, setStarted] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const evidenceTrigger = useRef<HTMLButtonElement | null>(null)
  const resumeAfterDeskClose = useRef(false)
  const suppressAutoPlayAfterDeskClose = useRef(false)
  const [developerPreviewOpen, setDeveloperPreviewOpen] = useState(false)
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const gesturePlayedCue = useRef<string | null>(null)
  const accessMode = progress.accessibilityMode ?? 'audio-first'
  const saveAccessMode = useCallback((mode: AccessMode) => {
    updateProgress((current) => ({ ...current, accessibilityMode: mode }))
    onAccessModeChange?.(mode)
  }, [onAccessModeChange, updateProgress])
  const observedTime = observeCourtTime(Date.parse(progress.highestObservedTime), now())
  const availability = getSessionAvailability(
    courtWeek.manifest.sessions.map((session) => ({
      id: session.id,
      unlockAt: session.unlockAt,
      prerequisites: session.prerequisiteSessionIds,
    })),
    progress.completedSessionIds,
    observedTime,
  )
  const allSessionsCompleted = courtWeek.manifest.sessions.every((session) =>
    progress.completedSessionIds.includes(session.id),
  )
  const activeSession = useMemo(() => {
    const replaySession = replaySessionId
      ? courtWeek.manifest.sessions.find((session) => session.id === replaySessionId)
      : undefined
    if (replaySession) return replaySession
    const uncompleted = courtWeek.manifest.sessions.filter(
      (session) => !progress.completedSessionIds.includes(session.id),
    )
    return (
      uncompleted.find((session) =>
        session.id === progress.currentSessionId &&
        availability.find((item) => item.id === session.id)?.ready,
      ) ??
      uncompleted.find((session) => availability.find((item) => item.id === session.id)?.ready) ??
      uncompleted[0] ??
      courtWeek.manifest.sessions[courtWeek.manifest.sessions.length - 1]
    )
  }, [availability, courtWeek.manifest.sessions, progress.completedSessionIds, progress.currentSessionId, replaySessionId])
  const isReplay = replaySessionId === activeSession.id
  const position = cuePosition(activeSession, progress.currentSceneId, progress.currentCueId)
  const activeAvailability = availability.find((item) => item.id === activeSession.id)
  const returnVisit = !ephemeral && hasResumableProgress(courtWeek, progress)
  const entryPhase = position.scene.id.startsWith('sealed-')
    ? 'Court adjourned'
    : legalPhaseLabels[position.scene.phase]
  const entryPosition = `Next sitting: ${activeSession.day}. Current phase: ${entryPhase}.`
  const playbackCue = useMemo<SceneCue>(() => {
    const safeCue = replaySafeCue(position.cue, isReplay)
    if (safeCue.id === 'sun-verdict-return' && progress.sealedVerdict && progress.sealedAgreement) {
      return runtimeOpenCourtReturnCue(safeCue, progress.sealedVerdict, progress.sealedAgreement)
    }
    if (safeCue.id === 'sun-analysis') {
      return runtimeOutcomeAnalysisCue(
        safeCue, courtWeek.deliberation, progress.openCourtVerdictReturned, progress.returnedVerdict,
      )
    }
    return safeCue
  }, [courtWeek.deliberation, isReplay, position.cue, progress.openCourtVerdictReturned, progress.returnedVerdict, progress.sealedAgreement, progress.sealedVerdict])
  const presentedCue = useMemo<SceneCue>(() => {
    if (accessMode !== 'reading' || playbackCue.id === 'sun-verdict-return' || playbackCue.id === 'sun-analysis') {
      return playbackCue
    }
    // Keep the audio cue stable while Reading mode joins paced caption fragments.
    // A trusted selector gesture can then start audio before React commits the
    // display-only mode change without cue cleanup cancelling that playback.
    return attachCueTurns({
      ...playbackCue,
      text: joinAuthoredCueText(position.scene.cues, playbackCue),
    })
  }, [accessMode, playbackCue, position.scene.cues])
  const {
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
  } = useCourtWeekNavigation({
    accessMode,
    activeSession,
    courtWeekSessions: courtWeek.manifest.sessions,
    deskOpen,
    isReplay,
    position,
    progress,
    setReplaySessionId,
    setStarted,
    updateProgress,
  })
  const handleCueEnded = useCallback(() => {
    advance()
  }, [advance])
  const followingPlaybackCue = useMemo(() => {
    const sameSceneCue = nextReplaySafeCue(position.scene.cues, position.cueIndex, isReplay)
    if (sameSceneCue) return sameSceneCue
    if (position.scene.interaction) return undefined
    const nextSceneCue = activeSession.scenes[position.sceneIndex + 1]?.cues[0]
    return nextSceneCue ? replaySafeCue(nextSceneCue, isReplay) : undefined
  }, [activeSession.scenes, isReplay, position.cueIndex, position.scene, position.sceneIndex])
  const playback = useCuePlayback(
    playbackCue,
    handleCueEnded,
    entered ? activeSession.scenes[position.sceneIndex + 1]?.cues[0] : undefined,
    { deferSourceUntilPlay: true, followingCue: followingPlaybackCue },
  )
  const pauseCuePlayback = playback.pause
  const resumeCuePlayback = playback.play
  useEffect(() => {
    if (interactionOpen && (
      playback.status === 'playing' || playback.status === 'loading' || playback.status === 'speech-fallback'
    )) pauseCuePlayback()
  }, [interactionOpen, pauseCuePlayback, playback.status])
  useLayoutEffect(() => {
    if (interactionOpen || deskOpen || evidenceId) return
    advanceBlocked.current = false
    if (resumeAfterDeskClose.current) {
      resumeAfterDeskClose.current = false
      void resumeCuePlayback()
    }
  }, [advanceBlocked, deskOpen, evidenceId, interactionOpen, position.cue.id, resumeCuePlayback])
  const playCue = playback.play
  useEffect(() => {
    if (!hydrated) return
    const updateObservedTime = () => {
      if (document.visibilityState === 'hidden') return
      const highest = observeCourtTime(Date.parse(highestObservedTime.current), now())
      const observedTime = new Date(highest).toISOString()
      highestObservedTime.current = observedTime
      updateProgress((current) => highest <= Date.parse(current.highestObservedTime)
        ? current
        : { ...current, highestObservedTime: observedTime })
    }
    window.addEventListener('focus', updateObservedTime)
    document.addEventListener('visibilitychange', updateObservedTime)
    updateObservedTime()
    return () => {
      window.removeEventListener('focus', updateObservedTime)
      document.removeEventListener('visibilitychange', updateObservedTime)
    }
  }, [hydrated, now, updateProgress])
  useEffect(() => {
    if (suppressAutoPlayAfterDeskClose.current) {
      suppressAutoPlayAfterDeskClose.current = false
      return
    }
    if (!started || interactionOpen || deskOpen || evidenceId || advanceBlocked.current || accessMode === 'reading') return
    const alreadyPlayedFromGesture = gesturePlayedCue.current === playbackCue.id
    gesturePlayedCue.current = null
    if (alreadyPlayedFromGesture) return
    void playCue()
  }, [accessMode, advanceBlocked, deskOpen, evidenceId, interactionOpen, playCue, playbackCue.id, started])

  const playFromGesture = useCallback(() => {
    gesturePlayedCue.current = playbackCue.id
    setStarted(true)
    void playCue()
  }, [playCue, playbackCue.id])

  const enterCourt = useCallback((requestFullscreen = false) => {
    setEntered(true)
    onEnteredChange?.(true)
    updateProgress((current) => current.hasEnteredCourt ? current : { ...current, hasEnteredCourt: true })
    if (!allSessionsCompleted || replaySessionId) {
      if (accessMode !== 'reading') playFromGesture()
      else setStarted(true)
    }
    if (requestFullscreen) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    }
  }, [accessMode, allSessionsCompleted, onEnteredChange, playFromGesture, replaySessionId, updateProgress])

  const selectAccessMode = useCallback((mode: AccessMode) => {
    if (mode === accessMode) return
    saveAccessMode(mode)
    if (mode === 'reading') playback.pause()
    else playFromGesture()
  }, [accessMode, playback, playFromGesture, saveAccessMode])

  const toggleDesk = useCallback(() => {
    if (deskOpen) {
      if (!interactionOpen) suppressAutoPlayAfterDeskClose.current = true
      setDeskOpen(false)
      if (interactionOpen) resumeAfterDeskClose.current = false
      return
    }
    advanceBlocked.current = true
    resumeAfterDeskClose.current = playback.status === 'loading'
      || playback.status === 'playing'
      || playback.status === 'speech-fallback'
    playback.pause()
    setDeskOpen(true)
  }, [advanceBlocked, deskOpen, interactionOpen, playback])
  const evidenceLedger = useMemo(() => deriveEvidenceLedger(
    courtWeek.trial,
    courtWeek.manifest.sessions,
    { cueId: position.cue.id, authoredCueComplete: interactionOpen },
  ), [courtWeek.manifest.sessions, courtWeek.trial, interactionOpen, position.cue.id])
  const evidence = useMemo(() => (
    evidenceId
      ? evidenceLedger.find(({ evidence: item, state }) => item.id === evidenceId && state === 'admitted')?.evidence
      : undefined
  ), [evidenceId, evidenceLedger])
  const recordingReplayCues = useMemo(() => (
    evidence?.replaySourceCueId
      ? (() => {
          const ordered = courtWeek.manifest.sessions.flatMap((session) => (
            session.scenes.flatMap((scene) => scene.cues.map((cue) => ({ cue, sessionId: session.id })))
          ))
          const finalAdmissionIndex = ordered.findIndex(({ cue }) => (
            cue.admissionStatus === 'final' && cue.evidenceIds.includes(evidence.id)
          ))
          const currentIndex = ordered.findIndex(({ cue }) => cue.id === progress.currentCueId)
          const admissionSessionId = ordered[finalAdmissionIndex]?.sessionId
          const lawfullyAvailable = finalAdmissionIndex >= 0 && (
            Boolean(admissionSessionId && progress.completedSessionIds.includes(admissionSessionId))
            || currentIndex > finalAdmissionIndex
          )
          if (!lawfullyAvailable) return []
          return ordered
            .map(({ cue }) => cue)
            .filter((cue) => (cue.sourceCueId ?? cue.id) === evidence.replaySourceCueId)
            .map((cue) => cue)
        })()
      : []
  ), [courtWeek.manifest.sessions, evidence, progress.completedSessionIds, progress.currentCueId])

  const interaction = position.scene.interaction
  const persistedInteractionVote = interaction?.kind === 'seal-vote'
    ? progress.provisionalVote
    : interaction?.kind === 'second-vote'
      ? progress.secondVote
      : interaction?.kind === 'final-vote'
        ? progress.finalVote
        : undefined
  const effectiveInteractionChoice = interactionChoice ?? persistedInteractionVote
  const persistedBallotSealed = Boolean(
    persistedInteractionVote && (interaction?.kind === 'seal-vote' || interaction?.kind === 'second-vote'),
  )
  const ballotSealed = interactionSealed || persistedBallotSealed

  if (!hydrated) return (
    <main className="cw-loading" aria-busy="true">
      <p role="status">{storageUpgradeBlocked
        ? 'Another SimJury tab may be keeping your saved court record open. Close any other SimJury tabs or windows. This page will continue automatically without replacing your progress.'
        : 'Preparing your place in court…'}</p>
    </main>
  )

  if (!entered) {
    return (
      <CourtWeekEntry
        title={courtWeek.manifest.title}
        kicker={allSessionsCompleted
          ? 'Your private completion record'
          : returnVisit
            ? 'Return to your jury seat'
            : 'One fictional case · Seven self-paced sittings'}
        enterLabel={allSessionsCompleted
          ? 'View completion record'
          : returnVisit
            ? `Resume ${activeSession.day}`
            : 'Take your seat'}
        advisory={courtWeek.manifest.contentAdvisory}
        mode={accessMode}
        persistenceNotice={storageNotice}
        ephemeral={ephemeral}
        ephemeralAdvisory={ephemeralAdvisory}
        focusHeading={focusEntryHeading}
        localProfile={localProfile}
        canEnter={!entryBusy && Boolean(activeAvailability?.ready || progress.completedSessionIds.includes(activeSession.id))}
        busy={entryBusy}
        archivedProgress={archivedProgress}
        availabilityNote={entryBusy
          ? `${returnVisit ? `${entryPosition} ` : ''}Opening today’s court session…`
          : !activeAvailability?.ready && !progress.completedSessionIds.includes(activeSession.id)
          ? !activeAvailability?.unlocked
            ? `${returnVisit ? `${entryPosition} ` : ''}Court opens ${formatCourtUnlock(activeSession.unlockAt)}.`
            : `${returnVisit ? `${entryPosition} ` : ''}Complete the preceding sitting before returning.`
          : allSessionsCompleted
            ? 'Court Week complete. Your private completion record is ready.'
            : returnVisit
              ? entryPosition
              : undefined}
        onMode={saveAccessMode}
        onEnter={enterCourt}
      />
    )
  }
  if (allSessionsCompleted && !isReplay) {
    return (
      <CourtWeekCompletion
        sessions={courtWeek.manifest.sessions}
        progress={progress}
        deliberation={courtWeek.deliberation}
        evidence={courtWeek.trial.evidence}
        persistence={persistence}
        onExportProgress={ephemeral
          ? undefined
          : (includePrivateNotes) => downloadWeeklyProgress(progress, includePrivateNotes)}
        testSession={COURT_WEEK_TEST_HARNESS_ENABLED ? testSession : undefined}
        onReplay={(session) => {
          const firstScene = session.scenes[0]
          setReplaySessionId(session.id)
          setStarted(false)
          setInteractionOpen(false)
          setInteractionChoice(null)
          setInteractionSealed(false)
          setReasoningQuestion('')
          setReasoningEvidence('')
          setReasoningBasis('')
          if (firstScene?.cues[0]) commitPosition(session.id, firstScene.id, firstScene.cues[0].id)
        }}
        onSettings={() => { setEntered(false); onEnteredChange?.(false) }}
      />
    )
  }
  const betweenSittings = !isReplay && !started && progress.completedSessionIds.length > 0
  if (betweenSittings || (!activeAvailability?.ready && !progress.completedSessionIds.includes(activeSession.id))) {
    const sittingOpened = Boolean(activeAvailability?.unlocked)
    return (
      <main className="cw-entry" tabIndex={-1}>
        <div className="cw-entry__panel">
          <p className="cw-kicker">{activeAvailability?.ready ? 'Next sitting ready' : 'Court stands adjourned'}</p>
          <h1>Next sitting: {activeSession.day}</h1>
          {!sittingOpened ? (
            <p>Court opens {formatCourtUnlock(activeSession.unlockAt)}.</p>
          ) : (
            <p>
              This sitting opened {formatCourtUnlock(activeSession.unlockAt)}.
              {!activeAvailability?.ready ? ' Complete the preceding sitting before returning.' : ' Continue when you are ready.'}
            </p>
          )}
          {activeAvailability?.ready ? (
            <button className="cw-primary cw-entry__primary" type="button" onClick={() => enterCourt()}>
              Enter {activeSession.day} sitting
            </button>
          ) : (
            <button type="button" onClick={() => { setEntered(false); onEnteredChange?.(false) }}>Presentation settings</button>
          )}
        </div>
      </main>
    )
  }
  const releaseRoot = releaseBase ??
    `https://github.com/yanniedog/simjury/releases/download/${encodeURIComponent(courtWeek.manifest.releaseTag)}`
  const sceneCount = activeSession.scenes.length
  const progressLabel = `Scene ${position.sceneIndex + 1} of ${sceneCount}`
  const advanceTargetCue = accessMode === 'reading'
    ? nextAuthoredCue(position.scene.cues, position.cueIndex, isReplay ? isReplaySuppressedCue : () => false)
    : nextReplaySafeCue(position.scene.cues, position.cueIndex, isReplay)
  const nextScene = activeSession.scenes[position.sceneIndex + 1]
  const advanceLabel = courtAdvanceAction({
    targetEvent: advanceTargetCue?.event,
    interaction: position.scene.interaction,
    nextEvent: nextScene?.cues[0]?.event,
    replay: isReplay,
    sessionEndAction: activeSession.ordinal === courtWeek.manifest.sessions.length
      ? 'Complete Court Week'
      : `Finish ${activeSession.day} session`,
  })
  const firstBallot = firstBallotForScene(
    courtWeek.deliberation, position.scene.id, progress.provisionalVote,
  )
  const reviewsImproperArgument = position.scene.id === 'sat-improper'
  const selectedImproperIndex = reasoningBasis.startsWith('improper:')
    ? Number.parseInt(reasoningBasis.slice('improper:'.length), 10)
    : -1
  const improperArguments = courtWeek.deliberation.improperArguments ?? []
  const selectedImproperArgument = improperArguments[selectedImproperIndex] ?? null
  const reviewedPropositions = (courtWeek.deliberation.propositions ?? [])
    .filter(({ sceneIds }) => sceneIds.includes(position.scene.id))
  const influenceStage = contributionStage(position.scene.id)
  const recordsInfluence = influenceStage !== null
  const reasoningQuestions = recordsInfluence
    ? Array.from(new Set(reviewedPropositions.map(({ legalQuestion }) => legalQuestion)))
    : courtWeek.trial.offences.slice(0, 2).flatMap(({ elementQuestions }) => elementQuestions)
  const reasoningEvidenceIds = new Set(recordsInfluence
    ? reviewedPropositions
        .filter(({ legalQuestion }) => legalQuestion === reasoningQuestion)
        .flatMap(({ evidenceIds }) => evidenceIds)
    : courtWeek.trial.evidence.filter(({ status }) => status === 'admitted').map(({ id }) => id))
  const admittedEvidenceIds = new Set(evidenceLedger
    .filter(({ state }) => state === 'admitted')
    .map(({ evidence: item }) => item.id))
  const reasoningMoves = new Set(recordsInfluence
    ? reviewedPropositions
        .filter(({ legalQuestion, evidenceIds }) => (
          legalQuestion === reasoningQuestion && evidenceIds.includes(reasoningEvidence)
        ))
        .flatMap(({ moves }) => moves)
    : interaction?.options ?? [])
  const selectedProposition = reviewedPropositions.find((proposition) => (
    proposition.legalQuestion === reasoningQuestion &&
    proposition.evidenceIds.includes(reasoningEvidence) &&
    admittedEvidenceIds.has(reasoningEvidence) &&
    proposition.moves.includes(interactionChoice as ReasoningMove)
  ))
  const finishInteraction = (skipOptionalReasoning = false) => {
    if (!interaction) return
    if (isReplay) {
      let nextScene: CourtSession['scenes'][number] | undefined = activeSession.scenes[position.sceneIndex + 1]
      const sundayNext = activeSession.day === 'Sunday'
        ? nextSundaySceneId(position.scene.id, progress.secondBallotWasUnanimous ?? false)
        : null
      if (sundayNext) nextScene = activeSession.scenes.find((scene) => scene.id === sundayNext)
      resetInteraction()
      if (nextScene) {
        commitPosition(activeSession.id, nextScene.id, nextScene.cues[0].id)
      } else {
        setReplaySessionId(null)
        setStarted(false)
      }
      return
    }
    const choice = effectiveInteractionChoice
    const isReasoning = interaction.kind === 'reasoning'
    const contribution = isReasoning && !skipOptionalReasoning && selectedProposition
      ? assessReasoningContribution(courtWeek.deliberation, {
          propositionId: selectedProposition.id,
          sceneId: position.scene.id,
          legalQuestion: selectedProposition.legalQuestion,
          evidenceId: reasoningEvidence,
          move: interactionChoice as ReasoningMove,
          recordedAt: new Date(now()).toISOString(),
          improperClaim: selectedImproperArgument?.claim,
        }).contribution
      : null
    const contributions = [
      ...(progress.reasoningContributions ?? []),
      ...(contribution ? [contribution] : []),
    ]
    const patch: Partial<StoredWeeklyProgress> = {
      reasoningContributions: contributions,
    }

    if (interaction.kind === 'seal-vote' && choice) patch.provisionalVote = choice as Verdict
    if (interaction.kind === 'second-vote' && choice) {
      const vote = choice as Verdict
      patch.secondVote = vote
      const unanimous = unanimousVerdict(calculateSecondBallot(courtWeek.deliberation, vote, contributions))
      patch.secondBallotWasUnanimous = Boolean(unanimous)
      if (unanimous) {
        patch.sealedVerdict = unanimous
        patch.sealedAgreement = 'unanimous'
      }
    }
    if (interaction.kind === 'final-vote' && choice) {
      const vote = choice as Verdict
      const secondVote = progress.secondVote ?? progress.provisionalVote ?? vote
      const result = calculateFinalBallot({
        pack: courtWeek.deliberation,
        secondVote,
        finalVote: vote,
        contributions,
        secondBallotWasUnanimous: progress.secondBallotWasUnanimous ?? false,
        majorityDirectionReceived: progress.majorityDirectionReceived ?? false,
        elapsedCourtHours: 8.5,
      })
      patch.finalVote = vote
      patch.sealedVerdict = result.verdict
      patch.sealedAgreement = result.agreement
    }

    if ((interaction.kind === 'seal-vote' || interaction.kind === 'second-vote') && !ballotSealed) {
      updateProgress((current) => ({ ...current, ...patch }))
      setInteractionSealed(true)
      return
    }

    let nextScene: CourtSession['scenes'][number] | undefined = activeSession.scenes[position.sceneIndex + 1]
    const sundayNext = activeSession.day === 'Sunday' ? nextSundaySceneId(
      position.scene.id, patch.secondBallotWasUnanimous ?? false,
    ) : null
    if (sundayNext) nextScene = activeSession.scenes.find((scene) => scene.id === sundayNext)
    const completed = !nextScene
      ? Array.from(new Set([...progress.completedSessionIds, activeSession.id]))
      : progress.completedSessionIds
    const nextSession = !nextScene ? courtWeek.manifest.sessions[activeSession.ordinal] : undefined
    updateProgress((current) => ({
      ...current,
      ...patch,
      completedSessionIds: completed,
      currentSessionId: nextScene ? activeSession.id : nextSession?.id,
      currentSceneId: nextScene?.id ?? nextSession?.scenes[0]?.id,
      currentCueId: nextScene?.cues[0]?.id ?? nextSession?.scenes[0]?.cues[0]?.id,
    }))
    resetInteraction()
    if (!nextScene) setStarted(false)
  }

  let overlay = null
  if (COURT_WEEK_TEST_HARNESS_ENABLED && developerPreviewOpen && testSession) {
    const closeTestSession = () => {
      setDeveloperPreviewOpen(false)
      advanceBlocked.current = false
    }
    overlay = (
      <CourtSheet
        title="Test session controls"
        kicker="TEST SESSION"
        className="cw-interaction"
        closeLabel="Close test session controls"
        returnFocusTo={interactionReturnFocus.current}
        fallbackReturnFocusSelector=".cw-controls__advance, .cw-controls button:not([disabled])"
        onClose={closeTestSession}
        footer={<div className="cw-button-row">
          <button type="button" onClick={() => {
            closeTestSession()
            testSession.onLeave()
          }}>Leave test session</button>
        </div>}
      >
        <p>Saved juror progress is untouched. Test changes are discarded.</p>
        <label className="cw-developer-day" htmlFor="cw-developer-day-modal">Session</label>
        <select
          id="cw-developer-day-modal"
          value={testSession.selectedOrdinal}
          onChange={(event) => testSession.onSelect(Number(event.target.value))}
        >
          {testSession.sessions.map(({ day, ordinal }) => (
            <option key={ordinal} value={ordinal}>{day}</option>
          ))}
        </select>
      </CourtSheet>
    )
  } else if (deskOpen) {
    overlay = (
      <>
        <JurorDesk
          caseTitle={courtWeek.manifest.title}
          trial={courtWeek.trial}
          sessions={courtWeek.manifest.sessions}
          deliberation={courtWeek.deliberation.propositions ? courtWeek.deliberation : undefined}
          progress={progress}
          activeSessionId={activeSession.id}
          activePhase={position.scene.phase}
          currentCueId={position.cue.id}
          currentCueComplete={interactionOpen}
          evidenceLedger={evidenceLedger}
          saveStatus={isReplay ? 'Replay keeps saved work unchanged.'
            : persistence === 'indexeddb' ? 'Stored privately on this device.'
              : persistence === 'ephemeral' ? 'Test-session work is discarded when you leave.'
                : persistence === 'pending' ? 'Checking device storage.'
                  : 'Held in this tab only; export before leaving.'}
          progressTransferEnabled={!ephemeral}
          progressImportEnabled={!interactionOpen}
          readOnly={isReplay}
          inactive={Boolean(evidence)}
          fallbackReturnFocusSelector={interactionOpen ? '#cw-interaction-desk' : undefined}
          onNotesChange={(notes) => updateProgress((current) => ({ ...current, notes }))}
          prepareImport={prepareProgressImport
            ? (text) => prepareProgressImport(text, progress)
            : undefined}
          onImport={async (candidate) => {
            const imported = mergeImportedWeeklyProgress(progress, candidate.progress)
            await commitProgressImport(() => candidate.commit(imported))
          }}
          onInspectEvidence={(id, trigger) => {
            playback.pause()
            evidenceTrigger.current = trigger
            setEvidenceId(id)
          }}
          onClose={toggleDesk}
        />
        {evidence ? (
          <EvidenceViewer
            evidence={evidence}
            recordingCues={recordingReplayCues}
            showRecordingCaptions={accessMode !== 'audio-first'}
            expandRecordingCaptions={accessMode === 'reading'}
            returnFocusTo={evidenceTrigger.current}
            onClose={() => setEvidenceId(null)}
          />
        ) : null}
      </>
    )
  } else if (interactionOpen && interaction) {
    const isVote = interaction.kind === 'seal-vote' || interaction.kind === 'second-vote' || interaction.kind === 'final-vote'
    const closeInteraction = () => {
      suppressAutoPlayAfterDeskClose.current = true
      setInteractionOpen(false)
    }
    const interactionFooter = <>
      <button
        className="cw-primary"
        type="button"
        disabled={
          !isReplay && (
            (!effectiveInteractionChoice && (isVote || Boolean(interaction.options?.length))) ||
            (interaction.kind === 'reasoning' && (
              (recordsInfluence
                ? !selectedProposition
                : !reasoningQuestion || !reasoningEvidence || !interactionChoice) ||
              (reviewsImproperArgument && !reasoningBasis)
            ))
          )
        }
        onClick={() => finishInteraction()}
      >
        {interactionPrimaryAction({
          kind: interaction.kind,
          replay: isReplay,
          replayEnds: !nextScene,
          ballotSealed,
          secondBallotWasUnanimous: progress.secondBallotWasUnanimous ?? false,
          prompt: interaction.prompt,
          recordsReasoning: recordsInfluence,
        })}
      </button>
      {!isReplay && interaction.kind === 'reasoning' && interaction.optional ? (
        <button type="button" onClick={() => finishInteraction(true)}>
          Skip this contribution
        </button>
      ) : null}
    </>
    overlay = (
      <CourtSheet
        title={interaction.prompt}
        kicker="Your contribution"
        className="cw-interaction"
        closeLabel="Return to the court view"
        returnFocusTo={interactionReturnFocus.current}
        fallbackReturnFocusSelector=".cw-controls__advance, .cw-controls button:not([disabled])"
        initialFocusSelector=".cw-sheet__body button, .cw-sheet__body select, .cw-sheet__body input, .cw-sheet__body textarea, .cw-sheet__body a[href], .cw-sheet__body summary, .cw-sheet__body [tabindex]"
        onClose={closeInteraction}
        footer={interactionFooter}
      >
        {isReplay ? (
          <p>Replay mode. Your sealed contributions, ballots and returned result remain unchanged.</p>
        ) : isVote ? (
          <VerdictChoices
            disabled={ballotSealed}
            selected={effectiveInteractionChoice as Verdict | undefined}
            onSelect={(verdict) => {
              setInteractionChoice(verdict)
            }}
          />
        ) : interaction.kind === 'reasoning' ? (
          <div className="cw-choice-grid">
            <label>
              Legal question
              <select value={reasoningQuestion} onChange={(event) => {
                setReasoningQuestion(event.target.value)
                setReasoningEvidence('')
                setInteractionChoice(null)
              }}>
                <option value="">Choose a question</option>
                {reasoningQuestions.map((question) => <option key={question}>{question}</option>)}
              </select>
            </label>
            <label>
              Admitted evidence
              <select value={reasoningEvidence} onChange={(event) => {
                setReasoningEvidence(event.target.value)
                setInteractionChoice(null)
              }}>
                <option value="">Choose admitted evidence</option>
                {courtWeek.trial.evidence.filter((item) => (
                  reasoningEvidenceIds.has(item.id) && admittedEvidenceIds.has(item.id)
                )).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            {(interaction.options ?? []).filter((option) => reasoningMoves.has(option as ReasoningMove)).map((option) => (
              <button key={option} type="button" aria-pressed={interactionChoice === option} onClick={() => setInteractionChoice(option)}>
                {reasoningMoveLabels[option as ReasoningMove]}
              </button>
            ))}
            {reviewsImproperArgument ? (
              <fieldset className="cw-reasoning-boundary">
                <legend>Check the proposed basis</legend>
                <label>
                  <input
                    type="radio"
                    name="reasoning-basis"
                    value="lawful"
                    checked={reasoningBasis === 'lawful'}
                    onChange={(event) => setReasoningBasis(event.target.value)}
                  />
                  Stay with admitted evidence and the judge’s directions.
                </label>
                {improperArguments.map((argument, index) => (
                  <label key={argument.claim}>
                    <input
                      type="radio"
                      name="reasoning-basis"
                      value={improperBasisToken(index)}
                      checked={reasoningBasis === improperBasisToken(index)}
                      onChange={(event) => setReasoningBasis(event.target.value)}
                    />
                    {improperBasisLabels[index] ?? 'Rely on another prohibited basis'}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {selectedImproperArgument ? (
              <div className="cw-reasoning-correction" role="status" aria-live="polite">
                <strong>Juror correction</strong>
                <p>{selectedImproperArgument.correction}</p>
                <p>This proposed basis is excluded and receives no influence in the room.</p>
              </div>
            ) : null}
          </div>
        ) : interaction.options?.length ? (
          <div className="cw-choice-grid">
            {interaction.options.map((option) => (
              <button key={option} type="button" aria-pressed={interactionChoice === option} onClick={() => setInteractionChoice(option)}>
                {option}
              </button>
            ))}
          </div>
        ) : null}
        {firstBallot ? (
          <dl className="cw-ballot" aria-label="Anonymous first ballot">
            {(Object.entries(firstBallot) as [Verdict, number][]).map(([verdict, count]) => (
              <div key={verdict}><dt>{verdictLabels[verdict]}</dt><dd>{count}</dd></div>
            ))}
          </dl>
        ) : null}
        {position.scene.id === 'sun-second-ballot' && (ballotSealed || isReplay) && progress.secondVote ? (
          <dl className="cw-ballot" aria-label="Anonymous second ballot">
            {(Object.entries(calculateSecondBallot(
              courtWeek.deliberation,
              progress.secondVote,
              progress.reasoningContributions ?? [],
            )) as [Verdict, number][]).map(([verdict, count]) => (
              <div key={verdict}><dt>{verdictLabels[verdict]}</dt><dd>{count}</dd></div>
            ))}
          </dl>
        ) : null}
        {interaction.kind === 'inspect-exhibit' ? (
          <button id="cw-interaction-desk" type="button" onClick={toggleDesk}>Open juror desk to inspect admitted exhibits</button>
        ) : interaction.kind === 'reasoning' || (isVote && !ballotSealed && !isReplay) ? (
          <button id="cw-interaction-desk" type="button" onClick={toggleDesk}>Review juror desk and admitted evidence</button>
        ) : null}
      </CourtSheet>
    )
  }

  return (
    <ImmersiveCourtShell
      session={activeSession}
      scene={position.scene}
      cue={presentedCue}
      activeTurn={presentedCue.turns?.find((turn) => turn.id === playback.activeTurnId)}
      releaseBase={releaseRoot}
      accessMode={accessMode}
      playbackStatus={playback.status}
      playbackError={[playback.error, storageNotice ?? (
        persistence === 'memory' ? 'Progress is held in this tab. Export it before leaving.' : null
      )].filter(Boolean).join(' ') || null}
      progressLabel={progressLabel}
      advanceLabel={advanceLabel}
      deskOpen={deskOpen}
      overlay={overlay}
      onPlay={() => {
        playFromGesture()
      }}
      onPause={playback.pause}
      onRepeat={() => void playback.repeat()}
      onAdvance={advance}
      onMode={selectAccessMode}
      onToggleDesk={toggleDesk}
      onOpenTestSession={COURT_WEEK_TEST_HARNESS_ENABLED && testSession ? (trigger) => {
        interactionReturnFocus.current = trigger
        advanceBlocked.current = true
        playback.pause()
        setDeveloperPreviewOpen(true)
      } : undefined}
    />
  )
}
