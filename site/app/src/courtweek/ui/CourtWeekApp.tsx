import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CourtWeek, CourtSession, ReasoningMove, SceneCue, Verdict } from '../model/schema'
import {
  analysisForReturnedVerdict,
  calculateFinalBallot,
  calculateSecondBallot,
  firstBallotForScene,
  matchImproperArgument,
  nextSundaySceneId,
  openCourtReturn,
  unanimousVerdict,
} from '../engine/deliberation'
import { useCuePlayback } from '../media/useCuePlayback'
import {
  getSessionAvailability,
  observeCourtTime,
  formatCourtUnlock,
} from '../state/schedule'
import { type AccessMode, type StoredWeeklyProgress, downloadWeeklyProgress } from '../state/progress'
import { useWeeklyProgress } from '../state/useWeeklyProgress'
import { EvidenceViewer } from './EvidenceViewer'
import { CourtWeekCompletion } from './CourtWeekCompletion'
import { ImmersiveCourtShell } from './ImmersiveCourtShell'
import { JurorDesk } from './JurorDesk'
import '../courtweek.css'

export interface CourtWeekAppProps {
  courtWeek: CourtWeek
  now?: () => number
  releaseBase?: string
}
const verdictLabels: Record<Verdict, string> = {
  murder: 'Guilty of murder',
  manslaughter: 'Guilty of manslaughter by criminal negligence',
  'not-guilty': 'Not Guilty',
  'unable-to-agree': 'Unable to agree',
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
}: {
  title: string
  advisory: string
  mode: AccessMode
  onMode: (mode: AccessMode) => void
  onEnter: (fullscreen: boolean) => void
}) {
  const [fullscreen, setFullscreen] = useState(false)
  return (
    <main className="cw-entry">
      <div className="cw-entry__panel">
        <p className="cw-kicker">A seven-day fictional jury experience</p>
        <h1>{title}</h1>
        <p>{advisory}</p>
        <p>SimJury is fictional and intended for adults aged 18 and older.</p>
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
        <label className="cw-entry__fullscreen">
          <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
          Ask to enter full screen
        </label>
        <button className="cw-primary" type="button" onClick={() => onEnter(fullscreen)}>
          Take your seat
        </button>
        <p className="cw-entry__privacy">Progress and private notes stay on this device unless you export them.</p>
      </div>
    </main>
  )
}
function VerdictChoices({
  selected,
  onSelect,
}: {
  selected?: Verdict
  onSelect: (verdict: Verdict) => void
}) {
  return (
    <div className="cw-verdict-grid">
      {(Object.keys(verdictLabels) as Verdict[]).map((verdict) => (
        <button
          key={verdict}
          type="button"
          aria-pressed={selected === verdict}
          onClick={() => onSelect(verdict)}
        >
          {verdictLabels[verdict]}
        </button>
      ))}
    </div>
  )
}
export function CourtWeekApp({ courtWeek, now = Date.now, releaseBase }: CourtWeekAppProps) {
  const baseline = useMemo(() => initialProgress(courtWeek, now()), [courtWeek, now])
  const { progress, hydrated, persistence, updateProgress } = useWeeklyProgress(baseline)
  const [entered, setEntered] = useState(false)
  const [started, setStarted] = useState(false)
  const [deskOpen, setDeskOpen] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [interactionChoice, setInteractionChoice] = useState<string | null>(null)
  const [interactionSealed, setInteractionSealed] = useState(false)
  const [reasoningQuestion, setReasoningQuestion] = useState('')
  const [reasoningEvidence, setReasoningEvidence] = useState('')
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null)
  const accessMode = progress.accessibilityMode ?? 'audio-first'
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
    if (position.cue.id === 'sun-verdict-return' && progress.returnedVerdict && progress.returnedAgreement) {
      return {
        ...position.cue,
        text: openCourtReturn(progress.returnedVerdict, progress.returnedAgreement),
        accessibleProposition: `The accused stands while the ${progress.returnedAgreement} result is spoken and recorded in open court.`,
      }
    }
    if (position.cue.id === 'sun-analysis') {
      if (!progress.returnedVerdict) {
        return {
          ...position.cue,
          text: 'Analysis remains sealed until the jury has returned its result in open court.',
          accessibleProposition: 'Post-verdict analysis is not available before the open-court return.',
        }
      }
      const analysis = analysisForReturnedVerdict(courtWeek.deliberation, progress.returnedVerdict)
      if (!analysis) return position.cue
      return {
        ...position.cue,
        text: `Strongest lawful rationale: ${analysis.lawfulRationale}\n\nStrongest counter-analysis: ${analysis.counterAnalysis}`,
        accessibleProposition: 'Balanced analysis presents the strongest lawful rationale and counter-analysis for the returned result without declaring a correct answer.',
      }
    }
    return position.cue
  }, [courtWeek.deliberation, position.cue, progress.returnedAgreement, progress.returnedVerdict])
  const commitPosition = useCallback((sessionId: string, sceneId: string, cueId: string) => {
    updateProgress((current) => ({
      ...current,
      currentSessionId: sessionId,
      currentSceneId: sceneId,
      currentCueId: cueId,
    }))
  }, [updateProgress])

  const advance = useCallback(() => {
    const nextCue = position.scene.cues[position.cueIndex + 1]
    if (nextCue) {
      commitPosition(activeSession.id, position.scene.id, nextCue.id)
      return
    }
    if (position.scene.interaction && !interactionOpen) {
      setInteractionOpen(true)
      return
    }
    const nextScene = activeSession.scenes[position.sceneIndex + 1]
    if (nextScene) {
      setInteractionOpen(false)
      setInteractionChoice(null)
      setInteractionSealed(false)
      commitPosition(activeSession.id, nextScene.id, nextScene.cues[0].id)
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
  }, [activeSession, commitPosition, courtWeek.manifest.sessions, interactionOpen, isReplay, position, progress.completedSessionIds, updateProgress])
  const handleCueEnded = useCallback(() => {
    advance()
  }, [advance])
  const playback = useCuePlayback(
    presentedCue,
    handleCueEnded,
    activeSession.scenes[position.sceneIndex + 1]?.cues[0],
  )
  const playCue = playback.play
  useEffect(() => {
    const updateObservedTime = () => {
      if (document.visibilityState === 'hidden') return
      const highest = observeCourtTime(Date.parse(progress.highestObservedTime), now())
      if (highest > Date.parse(progress.highestObservedTime)) {
        updateProgress((current) => ({
          ...current,
          highestObservedTime: new Date(highest).toISOString(),
        }))
      }
    }
    window.addEventListener('focus', updateObservedTime)
    document.addEventListener('visibilitychange', updateObservedTime)
    updateObservedTime()
    return () => {
      window.removeEventListener('focus', updateObservedTime)
      document.removeEventListener('visibilitychange', updateObservedTime)
    }
  }, [now, progress.highestObservedTime, updateProgress])
  useEffect(() => {
    if (!started || interactionOpen || accessMode === 'reading') return
    void playCue()
  }, [accessMode, interactionOpen, playCue, position.cue.id, started])

  if (!hydrated) return <main className="cw-loading" aria-busy="true"><p>Preparing the courtroom…</p></main>

  if (!entered) {
    return (
      <CourtWeekEntry
        title={courtWeek.manifest.title}
        advisory={courtWeek.manifest.contentAdvisory}
        mode={accessMode}
        onMode={(mode) => updateProgress((current) => ({ ...current, accessibilityMode: mode }))}
        onEnter={(requestFullscreen) => {
          setEntered(true)
          if (allSessionsCompleted && !replaySessionId) {
            if (requestFullscreen) {
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
            return
          }
          setStarted(true)
          if (accessMode !== 'reading') void playback.play()
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
        onExportProgress={() => downloadWeeklyProgress(progress, true)}
        onReplay={(session) => {
          const firstScene = session.scenes[0]
          setReplaySessionId(session.id)
          setStarted(false)
          setInteractionOpen(false)
          setInteractionChoice(null)
          setInteractionSealed(false)
          setReasoningQuestion('')
          setReasoningEvidence('')
          if (firstScene?.cues[0]) commitPosition(session.id, firstScene.id, firstScene.cues[0].id)
        }}
        onSettings={() => setEntered(false)}
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
          <button type="button" onClick={() => setEntered(false)}>Presentation settings</button>
        </div>
      </main>
    )
  }
  const evidence = evidenceId
    ? courtWeek.trial.evidence.find((item) => item.id === evidenceId)
    : undefined
  const releaseRoot = releaseBase ??
    `https://github.com/yanniedog/simjury/releases/download/${encodeURIComponent(courtWeek.manifest.releaseTag)}`
  const sceneCount = activeSession.scenes.length
  const progressLabel = `Scene ${position.sceneIndex + 1} of ${sceneCount}`
  const interaction = position.scene.interaction
  const firstBallot = firstBallotForScene(
    courtWeek.deliberation, position.scene.id, progress.provisionalVote,
  )
  const finishInteraction = () => {
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
      if (nextScene) {
        commitPosition(activeSession.id, nextScene.id, nextScene.cues[0].id)
      } else {
        setReplaySessionId(null)
        setStarted(false)
      }
      return
    }
    const choice = interactionChoice
    const isReasoning = interaction.kind === 'reasoning'
    const contribution = isReasoning && choice && reasoningQuestion && reasoningEvidence
      ? {
          sceneId: position.scene.id,
          legalQuestion: reasoningQuestion,
          evidenceId: reasoningEvidence,
          move: choice as ReasoningMove,
          recordedAt: new Date(now()).toISOString(),
          influencePenalty: matchImproperArgument(courtWeek.deliberation, choice)?.influencePenalty ?? 0,
        }
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
        patch.returnedVerdict = unanimous
        patch.returnedAgreement = 'unanimous'
      }
    }
    if (position.scene.id === 'sun-majority') patch.majorityDirectionReceived = true
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
      patch.returnedVerdict = result.verdict
      patch.returnedAgreement = result.agreement
    }

    if ((interaction.kind === 'seal-vote' || interaction.kind === 'second-vote') && !interactionSealed) {
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
    if (!nextScene) setStarted(false)
  }

  let overlay = null
  if (evidence) {
    overlay = <EvidenceViewer evidence={evidence} onClose={() => setEvidenceId(null)} />
  } else if (deskOpen) {
    overlay = (
      <JurorDesk
        trial={courtWeek.trial}
        progress={progress}
        onNotesChange={(notes) => updateProgress((current) => ({ ...current, notes }))}
        onImport={(imported) => updateProgress(imported)}
        onInspectEvidence={(id) => {
          playback.pause()
          setEvidenceId(id)
        }}
        onClose={() => setDeskOpen(false)}
      />
    )
  } else if (interactionOpen && interaction) {
    const isVote = interaction.kind === 'seal-vote' || interaction.kind === 'second-vote' || interaction.kind === 'final-vote'
    overlay = (
      <section className="cw-modal cw-interaction" role="dialog" aria-modal="true" aria-labelledby="cw-interaction-heading">
        <p className="cw-kicker">Your contribution</p>
        <h2 id="cw-interaction-heading">{interaction.prompt}</h2>
        {isReplay ? (
          <p>Replay mode. Your sealed contributions, ballots and returned result remain unchanged.</p>
        ) : isVote ? (
          <VerdictChoices
            selected={(interactionChoice as Verdict | null) ?? (
              interaction.kind === 'seal-vote'
                ? progress.provisionalVote
                : interaction.kind === 'second-vote'
                  ? progress.secondVote
                  : progress.finalVote
            )}
            onSelect={(verdict) => {
              setInteractionChoice(verdict)
              setInteractionSealed(false)
            }}
          />
        ) : interaction.kind === 'reasoning' ? (
          <div className="cw-choice-grid">
            <label>
              Legal question
              <select value={reasoningQuestion} onChange={(event) => setReasoningQuestion(event.target.value)}>
                <option value="">Choose a question</option>
                {courtWeek.deliberation.legalQuestions.map((question) => <option key={question}>{question}</option>)}
              </select>
            </label>
            <label>
              Admitted evidence
              <select value={reasoningEvidence} onChange={(event) => setReasoningEvidence(event.target.value)}>
                <option value="">Choose admitted evidence</option>
                {courtWeek.trial.evidence.filter((item) => item.status === 'admitted').map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            {(interaction.options ?? []).map((option) => (
              <button key={option} type="button" aria-pressed={interactionChoice === option} onClick={() => setInteractionChoice(option)}>
                {option}
              </button>
            ))}
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
        {position.scene.id === 'sun-second-ballot' && interactionSealed && progress.secondVote ? (
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
        <button
          className="cw-primary"
          type="button"
          disabled={
            !isReplay && (
              (!interactionChoice && (isVote || Boolean(interaction.options?.length))) ||
              (interaction.kind === 'reasoning' && (!reasoningQuestion || !reasoningEvidence))
            )
          }
          onClick={finishInteraction}
        >
          {isReplay ? 'Continue replay'
            : interactionSealed
            ? (progress.secondBallotWasUnanimous ? 'Return to court' : 'Continue deliberation')
            : interaction.kind === 'final-vote' ? 'Seal final ballot'
              : isVote ? 'Seal ballot' : 'Continue proceedings'}
        </button>
      </section>
    )
  }

  return (
    <ImmersiveCourtShell
      session={activeSession}
      scene={position.scene}
      cue={presentedCue}
      releaseBase={releaseRoot}
      accessMode={accessMode}
      playbackStatus={playback.status}
      playbackError={playback.error ?? (persistence === 'memory' ? 'Progress is held in this tab. Export it before leaving.' : null)}
      progressLabel={progressLabel}
      deskOpen={deskOpen}
      overlay={overlay}
      onPlay={() => {
        setStarted(true)
        void playback.play()
      }}
      onPause={playback.pause}
      onRepeat={() => void playback.repeat()}
      onAdvance={advance}
      onToggleCaptions={() => updateProgress((current) => ({
        ...current,
        accessibilityMode: current.accessibilityMode === 'captions' ? 'audio-first' : 'captions',
      }))}
      onToggleDesk={() => setDeskOpen((open) => {
        if (!open) playback.pause()
        return !open
      })}
    />
  )
}
