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
  openCourtReturnTurns,
  unanimousVerdict,
} from '../engine/deliberation'
import {
  joinAuthoredCueText,
  nextAuthoredCue,
} from '../content/captionPacing'
import { attachCueTurns } from '../content/cueTurns'
import { isReplaySuppressedCue, nextReplaySafeCue, replaySafeCue } from '../engine/replay'
import { contributionStage } from '../model/deliberationContract'
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
import type {
  LocalProfile,
  LocalProfileInput,
  LocalProfileIssue,
  LocalProfilePersistence,
} from '../state/localProfile'
import { useWeeklyProgress, type PersistenceIssue } from '../state/useWeeklyProgress'
import { COURT_WEEK_TEST_HARNESS_ENABLED } from '../testHarness'
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
  entryBusy?: boolean
  testSession?: {
    selectedOrdinal: number
    sessions: Array<{ ordinal: number; day: string }>
    onSelect: (ordinal: number) => void
    onLeave: () => void
  }
  onEnteredChange?: (entered: boolean) => void
  onAccessModeChange?: (mode: AccessMode) => void
  localProfile?: {
    profile: LocalProfile
    persistence: LocalProfilePersistence
    issue: LocalProfileIssue
    onChange: (profile: LocalProfileInput) => void
    onReset: () => void
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
function CourtWeekEntry({
  title,
  advisory,
  mode,
  onMode,
  onEnter,
  persistenceNotice,
  ephemeral,
  ephemeralAdvisory,
  focusHeading,
  localProfile,
  canEnter,
  availabilityNote,
  busy,
  archivedProgress,
}: {
  title: string
  advisory: string
  mode: AccessMode
  onMode: (mode: AccessMode) => void
  onEnter: (fullscreen: boolean) => void
  persistenceNotice: string | null
  ephemeral: boolean
  ephemeralAdvisory?: string
  focusHeading: boolean
  localProfile?: CourtWeekAppProps['localProfile']
  canEnter: boolean
  availabilityNote?: string
  busy: boolean
  archivedProgress: StoredWeeklyProgress[]
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [includeArchiveNotes, setIncludeArchiveNotes] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const enterButtonRef = useRef<HTMLButtonElement>(null)
  const settingsSummaryRef = useRef<HTMLElement>(null)
  const focusAfterAcknowledgement = useRef(false)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  const fullscreenSupported = typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
  const modeLabels: Record<AccessMode, string> = {
    'audio-first': 'Audio first',
    captions: 'Audio + captions',
    reading: 'Reading',
  }
  const acknowledged = !localProfile || localProfile.profile.adultFictionAcknowledged
  useEffect(() => {
    if (!acknowledged || !focusAfterAcknowledgement.current) return
    focusAfterAcknowledgement.current = false
    if (canEnter) enterButtonRef.current?.focus()
    else settingsSummaryRef.current?.focus()
  }, [acknowledged, canEnter])
  const updateAcknowledgement = (adultFictionAcknowledged: boolean) => {
    if (!localProfile) return
    focusAfterAcknowledgement.current = adultFictionAcknowledged
    localProfile.onChange({
      jurorLabel: localProfile.profile.jurorLabel,
      adultFictionAcknowledged,
    })
  }
  return (
    <main className="cw-entry" tabIndex={-1} aria-busy={busy || undefined}>
      <div className="cw-entry__panel">
        <p className="cw-kicker">One case · Seven self-paced sessions</p>
        <h1 ref={headingRef} tabIndex={focusHeading ? -1 : undefined}>{title}</h1>
        <p className="cw-entry__advisory">{ephemeral && ephemeralAdvisory ? ephemeralAdvisory : advisory}</p>
        {persistenceNotice ? <p className="cw-error" role="alert">{persistenceNotice}</p> : null}
        {!acknowledged ? (
          <label className="cw-entry__consent">
            <input
              type="checkbox"
              checked={false}
              onChange={(event) => updateAcknowledgement(event.target.checked)}
            />
            <span>
              <strong>I’m 18 or older and understand this case is fictional.</strong>
              <small>It deals directly with a non-graphic death and serious criminal allegations.</small>
            </span>
          </label>
        ) : null}
        {availabilityNote ? <p className="cw-entry__availability" role="status">{availabilityNote}</p> : null}
        {canEnter ? (
          <button
            ref={enterButtonRef}
            className="cw-primary cw-entry__primary"
            type="button"
            disabled={!acknowledged}
            onClick={() => onEnter(fullscreen)}
          >
            Take your seat
          </button>
        ) : null}
        <details className="cw-entry__settings">
          <summary ref={settingsSummaryRef}>
            <span>Experience settings</span>
            <small>{modeLabels[mode]}</small>
          </summary>
          <div className="cw-entry__settings-body">
            <p>Audio leads by default. Change this at any time during court.</p>
            <fieldset className="cw-mode-picker">
              <legend>Presentation</legend>
              {([
                ['audio-first', 'Audio first', 'Listen without visible captions.'],
                ['captions', 'Audio and captions', 'Listen with speaker-labelled captions.'],
                ['reading', 'Reading mode', 'Keep the complete dialogue visible.'],
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
            {fullscreenSupported ? (
              <label className="cw-entry__fullscreen">
                <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
                Ask to enter full screen
              </label>
            ) : null}
            {localProfile ? (
              <LocalProfilePanel {...localProfile} showAdultFictionAcknowledgement={false} />
            ) : null}
          </div>
        </details>
        {archivedProgress.length > 0 ? (
          <details className="cw-entry__settings cw-entry__archives">
            <summary><span>Previous trial records</span><small>{archivedProgress.length}</small></summary>
            <div className="cw-entry__settings-body">
              <p>These records remain separate from this revision. Their ballots and evidentiary conclusions are available only in an explicit archive export.</p>
              <label className="cw-entry__archive-notes">
                <input
                  type="checkbox"
                  checked={includeArchiveNotes}
                  onChange={(event) => setIncludeArchiveNotes(event.target.checked)}
                />
                Include private notes in archive exports
              </label>
              <ul className="cw-entry__archive-list">
                {archivedProgress.map((archived) => (
                  <li key={archived.revision}>
                    <span><strong>Case revision {archived.revision}</strong><small>{archived.completedSessionIds.length} sessions completed</small></span>
                    <button type="button" onClick={() => downloadWeeklyProgress(archived, includeArchiveNotes)}>
                      Export revision {archived.revision}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
        <p className="cw-entry__privacy">
          {ephemeral
            ? 'Temporary progress and private notes are discarded when you switch sessions or leave this session.'
            : persistenceNotice
            ? 'Use Export progress from the juror desk before leaving this tab.'
            : 'Private by design. Progress and notes stay on this device.'}
          {' '}<a href="/privacy/">Privacy</a>
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
  const { progress, archivedProgress, hydrated, persistence, persistenceIssue, updateProgress } = useWeeklyProgress(
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
  const interactionReturnFocus = useRef<HTMLElement | null>(null)
  const advanceBlocked = useRef(false)
  const resumeAfterDeskClose = useRef(false)
  const suppressAutoPlayAfterDeskClose = useRef(false)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [developerPreviewOpen, setDeveloperPreviewOpen] = useState(false)
  const [interactionChoice, setInteractionChoice] = useState<string | null>(null)
  const [interactionSealed, setInteractionSealed] = useState(false)
  const [reasoningQuestion, setReasoningQuestion] = useState('')
  const [reasoningEvidence, setReasoningEvidence] = useState('')
  const [reasoningBasis, setReasoningBasis] = useState('')
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
  const playbackCue = useMemo<SceneCue>(() => {
    const safeCue = replaySafeCue(position.cue, isReplay)
    if (safeCue.id === 'sun-verdict-return' && progress.sealedVerdict && progress.sealedAgreement) {
      const turns = openCourtReturnTurns(progress.sealedVerdict, progress.sealedAgreement)
      return {
        ...safeCue,
        text: openCourtReturn(progress.sealedVerdict, progress.sealedAgreement),
        turns,
        // The sealed outcome is dynamic. Static placeholder narration cannot
        // truthfully voice it, so device speech speaks each identified turn.
        audio: undefined,
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
    setInteractionChoice(null)
    setInteractionSealed(false)
  }, [accessMode, activeSession, commitPosition, courtWeek.manifest.sessions, deskOpen, interactionOpen, isReplay, position, progress.completedSessionIds, updateProgress])
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
    if (!started || interactionOpen || deskOpen || evidenceId || advanceBlocked.current || accessMode === 'reading') return
    const alreadyPlayedFromGesture = gesturePlayedCue.current === playbackCue.id
    gesturePlayedCue.current = null
    if (alreadyPlayedFromGesture) return
    void playCue()
  }, [accessMode, deskOpen, evidenceId, interactionOpen, playCue, playbackCue.id, started])

  const playFromGesture = useCallback(() => {
    gesturePlayedCue.current = playbackCue.id
    setStarted(true)
    void playCue()
  }, [playCue, playbackCue.id])

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

  if (!hydrated) return <main className="cw-loading" aria-busy="true"><p role="status">Preparing your place in court…</p></main>

  if (!entered) {
    return (
      <CourtWeekEntry
        title={courtWeek.manifest.title}
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
          ? 'Opening today’s court session…'
          : !activeAvailability?.ready && !progress.completedSessionIds.includes(activeSession.id)
          ? !activeAvailability?.unlocked
            ? `Court opens ${formatCourtUnlock(activeSession.unlockAt)}.`
            : 'Complete the preceding court session before returning.'
          : undefined}
        onMode={saveAccessMode}
        onEnter={(requestFullscreen) => {
          setEntered(true)
          onEnteredChange?.(true)
          if (allSessionsCompleted && !replaySessionId) {
            if (requestFullscreen) {
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
            return
          }
          if (accessMode !== 'reading') playFromGesture()
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
  if (!activeAvailability?.ready && !progress.completedSessionIds.includes(activeSession.id)) {
    return (
      <main className="cw-entry" tabIndex={-1}>
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
    if (isReplay) {
      let nextScene: CourtSession['scenes'][number] | undefined = activeSession.scenes[position.sceneIndex + 1]
      const sundayNext = activeSession.day === 'Sunday'
        ? nextSundaySceneId(position.scene.id, progress.secondBallotWasUnanimous ?? false)
        : null
      if (sundayNext) nextScene = activeSession.scenes.find((scene) => scene.id === sundayNext)
      setInteractionOpen(false)
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
    setInteractionChoice(null)
    setInteractionSealed(false)
    setReasoningQuestion('')
    setReasoningEvidence('')
    setReasoningBasis('')
    if (!nextScene) setStarted(false)
  }

  let overlay = null
  if (COURT_WEEK_TEST_HARNESS_ENABLED && developerPreviewOpen && testSession) {
    overlay = (
      <MandatoryInteractionDialog returnFocusTo={interactionReturnFocus.current}>
        <p className="cw-kicker">TEST SESSION</p>
        <h2 id="cw-interaction-heading">Test session controls</h2>
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
        <div className="cw-button-row">
          <button type="button" onClick={() => {
            setDeveloperPreviewOpen(false)
            advanceBlocked.current = false
          }}>Close</button>
          <button type="button" onClick={() => {
            setDeveloperPreviewOpen(false)
            advanceBlocked.current = false
            testSession.onLeave()
          }}>Leave test session</button>
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
          <button type="button" onClick={toggleDesk}>Open juror desk to inspect admitted exhibits</button>
        ) : null}
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
          {isReplay ? 'Continue replay'
            : ballotSealed
            ? (progress.secondBallotWasUnanimous ? 'Return to court' : 'Continue deliberation')
            : interaction.kind === 'final-vote' ? 'Seal final ballot'
              : isVote ? 'Seal ballot' : 'Continue proceedings'}
        </button>
        {!isReplay && interaction.kind === 'reasoning' && interaction.optional ? (
          <button
            type="button"
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
      accessMode={accessMode}
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
