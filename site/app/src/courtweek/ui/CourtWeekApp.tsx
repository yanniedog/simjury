import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CourtWeek, CourtSession, ReasoningMove, SceneCue, Verdict } from '../model/schema'
import {
  analysisForReturnedVerdict,
  assessReasoningContribution,
  calculateFinalBallot,
  calculateSecondBallot,
  firstBallotForScene,
  nextSundaySceneId,
  openCourtReturn,
  unanimousVerdict,
} from '../engine/deliberation'
import { nextReplaySafeCue, replaySafeCue } from '../engine/replay'
import { contributionStage } from '../model/deliberationContract'
import { useCuePlayback } from '../media/useCuePlayback'
import {
  courtWeekMediaPolicy,
  cueForMediaPolicy,
  navigatorRequestsDataSaver,
  nextCueForMediaPolicy,
} from '../media/dataSaver'
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
import type {
  LocalProfile,
  LocalProfileInput,
  LocalProfileIssue,
  LocalProfilePersistence,
} from '../state/localProfile'
import { useWeeklyProgress, type PersistenceIssue } from '../state/useWeeklyProgress'
import { EvidenceViewer } from './EvidenceViewer'
import { CourtWeekCompletion } from './CourtWeekCompletion'
import { ImmersiveCourtShell } from './ImmersiveCourtShell'
import { JurorDesk } from './JurorDesk'
import { LocalProfilePanel } from './LocalProfilePanel'
import { useModalFocusBoundary } from './useModalFocusBoundary'
import '../courtweek.css'

export interface CourtWeekAppProps {
  courtWeek: CourtWeek
  now?: () => number
  releaseBase?: string
  prepareProgressImport?: (
    text: string,
    current: StoredWeeklyProgress,
  ) => Promise<StoredWeeklyProgress>
  initialProgressOverride?: StoredWeeklyProgress
  ephemeral?: boolean
  ephemeralAdvisory?: string
  focusEntryHeading?: boolean
  developerPreview?: {
    selectedOrdinal: number
    sessions: Array<{ ordinal: number; day: string }>
    onSelect: (ordinal: number) => void
    onLeave: () => void
  }
  onEnteredChange?: (entered: boolean) => void
  localProfile?: {
    profile: LocalProfile
    persistence: LocalProfilePersistence
    issue: LocalProfileIssue
    onChange: (profile: LocalProfileInput) => void
    onReset: () => void
    onOpenDeveloperPreview: () => void
  }
}
const verdictLabels: Record<Verdict, string> = {
  murder: 'Guilty of murder',
  manslaughter: 'Guilty of manslaughter by criminal negligence',
  'not-guilty': 'Not Guilty',
  'unable-to-agree': 'Unable to agree',
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
    case 'revision-mismatch': return 'Saved progress belongs to a different case revision and was not loaded. A new session has started.'
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
function CourtWeekEntry({
  title,
  advisory,
  mode,
  onMode,
  onEnter,
  persistenceNotice,
  ephemeral,
  ephemeralAdvisory,
  dataSaver,
  narrationApproved,
  onDataSaver,
  onNarrationApproved,
  focusHeading,
  localProfile,
}: {
  title: string
  advisory: string
  mode: AccessMode
  onMode: (mode: AccessMode) => void
  onEnter: (fullscreen: boolean) => void
  persistenceNotice: string | null
  ephemeral: boolean
  ephemeralAdvisory?: string
  dataSaver: boolean
  narrationApproved: boolean
  onDataSaver: (enabled: boolean) => void
  onNarrationApproved: (approved: boolean) => void
  focusHeading: boolean
  localProfile?: CourtWeekAppProps['localProfile']
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  const fullscreenSupported = typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
  return (
    <main className="cw-entry">
      <div className="cw-entry__panel">
        <p className="cw-kicker">A seven-day fictional jury experience</p>
        <h1 ref={headingRef} tabIndex={focusHeading ? -1 : undefined}>{title}</h1>
        <p>{ephemeral && ephemeralAdvisory ? ephemeralAdvisory : advisory}</p>
        <p>SimJury is fictional and intended for adults aged 18 and older.</p>
        {localProfile ? <LocalProfilePanel {...localProfile} /> : null}
        {persistenceNotice ? <p className="cw-error" role="alert">{persistenceNotice}</p> : null}
        <p>Choose how the court should be presented. You can change captions later.</p>
        <fieldset className="cw-mode-picker">
          <legend>Presentation</legend>
          {([
            ['audio-first', 'Audio first', 'Courtroom narration with captions hidden.'],
            ['captions', 'Audio and captions', 'Courtroom narration with two-line captions.'],
            ['reading', 'Reading mode', 'All dialogue remains visible and audio is optional.'],
          ] as const).map(([value, label, description]) => (
            <label key={value}>
              <input
                type="radio"
                name="court-mode"
                value={value}
                checked={mode === value}
                onChange={() => onMode(value)}
              />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="cw-mode-picker">
          <legend>Data use</legend>
          <label>
            <input
              type="checkbox"
              checked={dataSaver}
              onChange={(event) => onDataSaver(event.target.checked)}
            />
            <span>
              <strong>Use less data</strong>
              <small>Uses the smallest supported scene artwork and turns off ambience and background preloading.</small>
            </span>
          </label>
        </fieldset>
        {dataSaver && mode !== 'reading' ? (
          <fieldset className="cw-mode-picker">
            <legend>Narration download</legend>
            <p>Recorded narration is not downloaded unless you approve it. Reading mode remains complete.</p>
            <label>
              <input
                type="radio"
                name="narration-download"
                checked={!narrationApproved}
                onChange={() => onNarrationApproved(false)}
              />
              <span><strong>Continue without recorded audio</strong><small>Show every spoken line for reading.</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="narration-download"
                checked={narrationApproved}
                onChange={() => onNarrationApproved(true)}
              />
              <span><strong>Download recorded narration</strong><small>Only the current cue is prepared; the next scene is not preloaded.</small></span>
            </label>
          </fieldset>
        ) : null}
        {fullscreenSupported ? (
          <label className="cw-entry__fullscreen">
            <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
            Ask to enter full screen
          </label>
        ) : null}
        <button
          className="cw-primary"
          type="button"
          onClick={() => onEnter(fullscreen)}
        >
          Take your seat
        </button>
        <p className="cw-entry__privacy">
          {ephemeral
            ? 'Preview progress and private notes are discarded when you switch sessions or leave preview.'
            : persistenceNotice
            ? 'Use Export progress from the juror desk before leaving this tab.'
            : 'Progress and private notes stay on this device unless you export them.'}
        </p>
      </div>
    </main>
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
function MandatoryInteractionDialog({
  children,
  returnFocusTo,
}: {
  children: ReactNode
  returnFocusTo?: HTMLElement | null
}) {
  const dialog = useRef<HTMLElement>(null)
  useModalFocusBoundary(
    dialog,
    returnFocusTo,
    '.cw-controls__advance, .cw-controls button:not([disabled])',
  )
  return (
    <section
      ref={dialog}
      className="cw-modal cw-interaction"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-interaction-heading"
      tabIndex={-1}
    >
      {children}
    </section>
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
  developerPreview,
  onEnteredChange,
  localProfile,
}: CourtWeekAppProps) {
  const baseline = useMemo(
    () => initialProgressOverride ?? initialProgress(courtWeek, now()),
    [courtWeek, initialProgressOverride, now],
  )
  const { progress, hydrated, persistence, persistenceIssue, updateProgress } = useWeeklyProgress(
    baseline,
    { ephemeral },
  )
  const highestObservedTime = useRef(progress.highestObservedTime)
  if (Date.parse(progress.highestObservedTime) > Date.parse(highestObservedTime.current)) {
    highestObservedTime.current = progress.highestObservedTime
  }
  const storageNotice = ephemeral ? null : persistenceNotice(persistenceIssue)
  const [entered, setEntered] = useState(false)
  const [dataSaver, setDataSaver] = useState(navigatorRequestsDataSaver)
  const [narrationApproved, setNarrationApproved] = useState(false)
  const [started, setStarted] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const evidenceTrigger = useRef<HTMLButtonElement | null>(null)
  const interactionReturnFocus = useRef<HTMLElement | null>(null)
  const advanceBlocked = useRef(false)
  const resumeAfterDeskClose = useRef(false)
  const suppressAutoPlayAfterDeskClose = useRef(false)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [developerPreviewOpen, setDeveloperPreviewOpen] = useState(false)
  const [interactionOpenedAt, setInteractionOpenedAt] = useState<number | null>(null)
  const [interactionChoice, setInteractionChoice] = useState<string | null>(null)
  const [interactionSealed, setInteractionSealed] = useState(false)
  const [reasoningQuestion, setReasoningQuestion] = useState('')
  const [reasoningEvidence, setReasoningEvidence] = useState('')
  const [reasoningBasis, setReasoningBasis] = useState('')
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const gesturePlayedCue = useRef<string | null>(null)
  const [, setInteractionTick] = useState(0)
  const accessMode = progress.accessibilityMode ?? 'audio-first'
  const mediaPolicy = useMemo(
    () => courtWeekMediaPolicy(dataSaver, narrationApproved),
    [dataSaver, narrationApproved],
  )
  const presentedAccessMode = mediaPolicy.recordedNarration || accessMode === 'reading'
    ? accessMode
    : 'reading'
  const readingForcedByDataSaver = presentedAccessMode === 'reading' && accessMode !== 'reading'
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
  const presentedCue = useMemo<SceneCue>(() => {
    const safeCue = replaySafeCue(position.cue, isReplay)
    if (safeCue.id === 'sun-verdict-return' && progress.sealedVerdict && progress.sealedAgreement) {
      return {
        ...safeCue,
        text: openCourtReturn(progress.sealedVerdict, progress.sealedAgreement),
        turns: undefined,
        accessibleProposition: `The accused stands while the ${progress.sealedAgreement} result is spoken and recorded in open court.`,
      }
    }
    if (safeCue.id === 'sun-analysis') {
      if (!progress.openCourtVerdictReturned || !progress.returnedVerdict) {
        return {
          ...safeCue,
          text: 'Analysis remains sealed until the jury has returned its result in open court.',
          turns: undefined,
          accessibleProposition: 'Post-verdict analysis is not available before the open-court return.',
        }
      }
      const analysis = analysisForReturnedVerdict(courtWeek.deliberation, progress.returnedVerdict)
      if (!analysis) return safeCue
      return {
        ...safeCue,
        text: `Strongest lawful rationale: ${analysis.lawfulRationale}\n\nStrongest counter-analysis: ${analysis.counterAnalysis}`,
        turns: undefined,
        accessibleProposition: 'Balanced analysis presents the strongest lawful rationale and counter-analysis for the returned result without declaring a correct answer.',
      }
    }
    return safeCue
  }, [courtWeek.deliberation, isReplay, position.cue, progress.openCourtVerdictReturned, progress.returnedVerdict, progress.sealedAgreement, progress.sealedVerdict])
  const commitPosition = useCallback((sessionId: string, sceneId: string, cueId: string, traversedCueId?: string) => {
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
    const nextCue = nextReplaySafeCue(position.scene.cues, position.cueIndex, isReplay)
    if (nextCue) {
      commitPosition(activeSession.id, position.scene.id, nextCue.id, isReplay ? undefined : position.cue.id)
      return
    }
    if (position.scene.interaction && !interactionOpen) {
      advanceBlocked.current = true
      interactionReturnFocus.current = trigger ?? (
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      )
      setInteractionOpen(true)
      setInteractionOpenedAt(now())
      return
    }
    const nextScene = activeSession.scenes[position.sceneIndex + 1]
    if (nextScene) {
      setInteractionOpen(false)
      setInteractionOpenedAt(null)
      setInteractionChoice(null)
      setInteractionSealed(false)
      commitPosition(activeSession.id, nextScene.id, nextScene.cues[0].id, isReplay ? undefined : position.cue.id)
      return
    }
    if (isReplay) {
      setReplaySessionId(null)
      setStarted(false)
      setInteractionOpen(false)
      setInteractionOpenedAt(null)
      setInteractionChoice(null)
      setInteractionSealed(false)
      return
    }
    const completed = Array.from(new Set([...progress.completedSessionIds, activeSession.id]))
    const nextSession = courtWeek.manifest.sessions[activeSession.ordinal]
    updateProgress((current) => ({
      ...current,
      completedSessionIds: completed,
      currentSessionId: nextSession?.id,
      currentSceneId: nextSession?.scenes[0]?.id,
      currentCueId: nextSession?.scenes[0]?.cues[0]?.id,
    }))
    setStarted(false)
    setInteractionOpen(false)
    setInteractionOpenedAt(null)
    setInteractionChoice(null)
    setInteractionSealed(false)
  }, [activeSession, commitPosition, courtWeek.manifest.sessions, deskOpen, interactionOpen, isReplay, now, position, progress.completedSessionIds, updateProgress])
  const handleCueEnded = useCallback(() => {
    advance()
  }, [advance])
  const playbackCue = useMemo<SceneCue>(
    () => cueForMediaPolicy(presentedCue, mediaPolicy),
    [mediaPolicy, presentedCue],
  )
  const followingPlaybackCue = useMemo(() => {
    const sameSceneCue = nextReplaySafeCue(position.scene.cues, position.cueIndex, isReplay)
    if (sameSceneCue) return nextCueForMediaPolicy(sameSceneCue, mediaPolicy)
    if (position.scene.interaction) return undefined
    const nextSceneCue = activeSession.scenes[position.sceneIndex + 1]?.cues[0]
    return nextCueForMediaPolicy(nextSceneCue ? replaySafeCue(nextSceneCue, isReplay) : undefined, mediaPolicy)
  }, [activeSession.scenes, isReplay, mediaPolicy, position.cueIndex, position.scene, position.sceneIndex])
  const playback = useCuePlayback(
    playbackCue,
    handleCueEnded,
    nextCueForMediaPolicy(entered ? activeSession.scenes[position.sceneIndex + 1]?.cues[0] : undefined, mediaPolicy),
    { deferSourceUntilPlay: true, followingCue: followingPlaybackCue },
  )
  const pauseCuePlayback = playback.pause
  const resumeCuePlayback = playback.play
  useEffect(() => {
    if (interactionOpen) pauseCuePlayback()
  }, [interactionOpen, pauseCuePlayback])
  useLayoutEffect(() => {
    if (interactionOpen || deskOpen || evidenceId) return
    advanceBlocked.current = false
    if (resumeAfterDeskClose.current) {
      resumeAfterDeskClose.current = false
      void resumeCuePlayback()
    }
  }, [deskOpen, evidenceId, interactionOpen, position.cue.id, resumeCuePlayback])
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
    if (!started || interactionOpen || deskOpen || evidenceId || advanceBlocked.current || presentedAccessMode === 'reading') return
    const alreadyPlayedFromGesture = gesturePlayedCue.current === presentedCue.id
    gesturePlayedCue.current = null
    if (alreadyPlayedFromGesture) return
    void playCue()
  }, [deskOpen, evidenceId, interactionOpen, playCue, presentedAccessMode, presentedCue.id, started])

  const playFromGesture = useCallback(() => {
    gesturePlayedCue.current = presentedCue.id
    setStarted(true)
    void playCue()
  }, [playCue, presentedCue.id])

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
  }, [deskOpen, interactionOpen, playback])
  const evidence = useMemo(() => (
    evidenceId ? courtWeek.trial.evidence.find((item) => item.id === evidenceId) : undefined
  ), [courtWeek.trial.evidence, evidenceId])
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
            .map((cue) => cueForMediaPolicy(cue, mediaPolicy))
        })()
      : []
  ), [courtWeek.manifest.sessions, evidence, mediaPolicy, progress.completedSessionIds, progress.currentCueId])

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
  const interactionElapsedSeconds = interactionOpen && interactionOpenedAt != null
    ? Math.max(0, (now() - interactionOpenedAt) / 1000)
    : 0
  const interactionMinimumMet = !interaction
    || isReplay
    || ballotSealed
    || interactionElapsedSeconds >= interaction.minimumSeconds
  useEffect(() => {
    if (!interactionOpen || !interaction || isReplay || interactionMinimumMet) return
    const remainingMs = Math.max(0, interaction.minimumSeconds * 1000 - interactionElapsedSeconds * 1000)
    const timer = window.setTimeout(() => setInteractionTick((value) => value + 1), Math.min(remainingMs + 16, 1000))
    return () => window.clearTimeout(timer)
  }, [interaction, interactionElapsedSeconds, interactionMinimumMet, interactionOpen, isReplay])

  if (!hydrated) return <main className="cw-loading" aria-busy="true"><p>Preparing the courtroom…</p></main>

  if (!entered) {
    return (
      <CourtWeekEntry
        title={courtWeek.manifest.title}
        advisory={courtWeek.manifest.contentAdvisory}
        mode={accessMode}
        persistenceNotice={storageNotice}
        ephemeral={ephemeral}
        ephemeralAdvisory={ephemeralAdvisory}
        dataSaver={dataSaver}
        narrationApproved={narrationApproved}
        focusHeading={focusEntryHeading}
        localProfile={localProfile}
        onDataSaver={setDataSaver}
        onNarrationApproved={setNarrationApproved}
        onMode={(mode) => updateProgress((current) => ({ ...current, accessibilityMode: mode }))}
        onEnter={(requestFullscreen) => {
          setEntered(true)
          onEnteredChange?.(true)
          if (allSessionsCompleted && !replaySessionId) {
            if (requestFullscreen) {
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
            return
          }
          if (presentedAccessMode !== 'reading') playFromGesture()
          else setStarted(true)
          if (requestFullscreen) {
            void document.documentElement.requestFullscreen?.().catch(() => undefined)
          }
        }}
      />
    )
  }
  if (allSessionsCompleted && !isReplay) {
    return (
      <CourtWeekCompletion
        sessions={courtWeek.manifest.sessions}
        persistence={persistence}
        onExportProgress={ephemeral
          ? undefined
          : (includePrivateNotes) => downloadWeeklyProgress(progress, includePrivateNotes)}
        developerPreview={developerPreview}
        onReplay={(session) => {
          const firstScene = session.scenes[0]
          setReplaySessionId(session.id)
          setStarted(false)
          setInteractionOpen(false)
          setInteractionOpenedAt(null)
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
  if (!activeAvailability?.ready && !progress.completedSessionIds.includes(activeSession.id)) {
    return (
      <main className="cw-entry">
        <div className="cw-entry__panel">
          <p className="cw-kicker">Court stands adjourned</p>
          <h1>{activeSession.day}: {activeSession.title}</h1>
          {!activeAvailability?.unlocked ? (
            <p>This session opens {formatCourtUnlock(activeSession.unlockAt)}.</p>
          ) : (
            <p>Complete the preceding court session before returning.</p>
          )}
          <button type="button" onClick={() => { setEntered(false); onEnteredChange?.(false) }}>Presentation settings</button>
        </div>
      </main>
    )
  }
  const releaseRoot = releaseBase ??
    `https://github.com/yanniedog/simjury/releases/download/${encodeURIComponent(courtWeek.manifest.releaseTag)}`
  const sceneCount = activeSession.scenes.length
  const progressLabel = `Scene ${position.sceneIndex + 1} of ${sceneCount}`
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
    proposition.moves.includes(interactionChoice as ReasoningMove)
  ))
  const finishInteraction = (skipOptionalReasoning = false) => {
    if (!interaction) return
    if (!interactionMinimumMet) return
    if (isReplay) {
      let nextScene: CourtSession['scenes'][number] | undefined = activeSession.scenes[position.sceneIndex + 1]
      const sundayNext = activeSession.day === 'Sunday'
        ? nextSundaySceneId(position.scene.id, progress.secondBallotWasUnanimous ?? false)
        : null
      if (sundayNext) nextScene = activeSession.scenes.find((scene) => scene.id === sundayNext)
      setInteractionOpen(false)
      setInteractionOpenedAt(null)
      setInteractionChoice(null)
      setInteractionSealed(false)
      setReasoningQuestion('')
      setReasoningEvidence('')
      setReasoningBasis('')
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
    setInteractionOpen(false)
    setInteractionOpenedAt(null)
    setInteractionChoice(null)
    setInteractionSealed(false)
    setReasoningQuestion('')
    setReasoningEvidence('')
    setReasoningBasis('')
    if (!nextScene) setStarted(false)
  }

  let overlay = null
  if (developerPreviewOpen && developerPreview) {
    overlay = (
      <MandatoryInteractionDialog returnFocusTo={interactionReturnFocus.current}>
        <p className="cw-kicker">DEV PREVIEW</p>
        <h2 id="cw-interaction-heading">Developer preview controls</h2>
        <p>Saved juror progress is untouched. Preview changes are discarded.</p>
        <label className="cw-developer-day" htmlFor="cw-developer-day-modal">Session</label>
        <select
          id="cw-developer-day-modal"
          value={developerPreview.selectedOrdinal}
          onChange={(event) => developerPreview.onSelect(Number(event.target.value))}
        >
          {developerPreview.sessions.map(({ day, ordinal }) => (
            <option key={ordinal} value={ordinal}>{day}</option>
          ))}
        </select>
        <div className="cw-button-row">
          <button type="button" onClick={() => {
            setDeveloperPreviewOpen(false)
            advanceBlocked.current = false
          }}>Close</button>
          <button type="button" onClick={() => {
            setDeveloperPreviewOpen(false)
            advanceBlocked.current = false
            developerPreview.onLeave()
          }}>Leave preview</button>
        </div>
      </MandatoryInteractionDialog>
    )
  } else if (deskOpen) {
    overlay = (
      <>
        <JurorDesk
          trial={courtWeek.trial}
          sessions={courtWeek.manifest.sessions}
          deliberation={courtWeek.deliberation.propositions ? courtWeek.deliberation : undefined}
          progress={progress}
          progressTransferEnabled={!ephemeral}
          readOnly={isReplay}
          inactive={Boolean(evidence)}
          onNotesChange={(notes) => updateProgress((current) => ({ ...current, notes }))}
          prepareImport={prepareProgressImport
            ? (text) => prepareProgressImport(text, progress)
            : undefined}
          onImport={(imported) => updateProgress((current) => (
            mergeImportedWeeklyProgress(current, imported)
          ))}
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
            showRecordingCaptions={presentedAccessMode !== 'audio-first'}
            expandRecordingCaptions={presentedAccessMode === 'reading'}
            returnFocusTo={evidenceTrigger.current}
            onClose={() => setEvidenceId(null)}
          />
        ) : null}
      </>
    )
  } else if (interactionOpen && interaction) {
    const isVote = interaction.kind === 'seal-vote' || interaction.kind === 'second-vote' || interaction.kind === 'final-vote'
    overlay = (
      <MandatoryInteractionDialog returnFocusTo={interactionReturnFocus.current}>
        <p className="cw-kicker">Your contribution</p>
        <h2 id="cw-interaction-heading">{interaction.prompt}</h2>
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
                {courtWeek.trial.evidence.filter((item) => reasoningEvidenceIds.has(item.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            {(interaction.options ?? []).filter((option) => reasoningMoves.has(option as ReasoningMove)).map((option) => (
              <button key={option} type="button" aria-pressed={interactionChoice === option} onClick={() => setInteractionChoice(option)}>
                {option}
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
        ) : (
          <div className="cw-choice-grid">
            {(interaction.options ?? ['Continue']).map((option) => (
              <button key={option} type="button" aria-pressed={interactionChoice === option} onClick={() => setInteractionChoice(option)}>
                {option}
              </button>
            ))}
          </div>
        )}
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
          <button type="button" onClick={toggleDesk}>Open juror desk to inspect admitted exhibits</button>
        ) : null}
        <button
          className="cw-primary"
          type="button"
          disabled={
            !isReplay && (
              !interactionMinimumMet ||
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
          {isReplay ? 'Continue replay'
            : !interactionMinimumMet
            ? `Continue in ${Math.max(1, Math.ceil(interaction.minimumSeconds - interactionElapsedSeconds))}s`
            : ballotSealed
            ? (progress.secondBallotWasUnanimous ? 'Return to court' : 'Continue deliberation')
            : interaction.kind === 'final-vote' ? 'Seal final ballot'
              : isVote ? 'Seal ballot' : 'Continue proceedings'}
        </button>
        {!isReplay && interaction.kind === 'reasoning' && interaction.optional ? (
          <button
            type="button"
            disabled={!interactionMinimumMet}
            onClick={() => finishInteraction(true)}
          >
            Continue without contributing
          </button>
        ) : null}
      </MandatoryInteractionDialog>
    )
  }

  return (
    <ImmersiveCourtShell
      session={activeSession}
      scene={position.scene}
      cue={presentedCue}
      activeTurn={presentedCue.turns?.find((turn) => turn.id === playback.activeTurnId)}
      releaseBase={releaseRoot}
      accessMode={presentedAccessMode}
      dataSaver={mediaPolicy.dataSaver}
      captionPreference={accessMode}
      captionsLocked={readingForcedByDataSaver}
      playbackStatus={playback.status}
      playbackError={[playback.error, storageNotice ?? (
        persistence === 'memory' ? 'Progress is held in this tab. Export it before leaving.' : null
      )].filter(Boolean).join(' ') || null}
      progressLabel={progressLabel}
      deskOpen={deskOpen}
      overlay={overlay}
      onPlay={() => {
        playFromGesture()
      }}
      onPause={playback.pause}
      onRepeat={() => void playback.repeat()}
      onAdvance={advance}
      onToggleCaptions={() => updateProgress((current) => ({
        ...current,
        accessibilityMode: current.accessibilityMode === 'captions' ? 'audio-first' : 'captions',
      }))}
      onToggleDesk={toggleDesk}
      onOpenDeveloperPreview={developerPreview ? (trigger) => {
        interactionReturnFocus.current = trigger
        advanceBlocked.current = true
        playback.pause()
        setDeveloperPreviewOpen(true)
      } : undefined}
    />
  )
}
