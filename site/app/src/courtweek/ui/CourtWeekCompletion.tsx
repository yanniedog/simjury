import { useEffect, useMemo, useRef, useState } from 'react'
import type { CourtSession, DeliberationPack, TrialRecord, Verdict } from '../model/schema'
import { reasoningMoveLabels } from '../model/deliberationContract'
import type { StoredWeeklyProgress } from '../state/progress'
import { COURT_WEEK_TEST_HARNESS_ENABLED } from '../testHarness'

const verdictLabels: Record<Verdict, string> = {
  murder: 'Guilty of murder',
  manslaughter: 'Guilty of manslaughter by criminal negligence',
  'not-guilty': 'Not Guilty',
  'unable-to-agree': 'Unable to agree',
}
const agreementLabels = {
  unanimous: 'Unanimous',
  majority: 'Majority',
  hung: 'Jury unable to agree',
} as const
export interface CourtWeekCompletionProps {
  sessions: CourtSession[]
  progress: StoredWeeklyProgress
  deliberation: Pick<DeliberationPack, 'outcomePaths'>
  evidence: TrialRecord['evidence']
  persistence: 'indexeddb' | 'memory' | 'pending' | 'ephemeral'
  onReplay: (session: CourtSession) => void
  onSettings: () => void
  onExportProgress?: (includePrivateNotes: boolean) => void
  testSession?: {
    selectedOrdinal: number
    sessions: Array<{ ordinal: number; day: string }>
    onSelect: (ordinal: number) => void
    onLeave: () => void
  }
}

export function CourtWeekCompletion({
  sessions,
  progress,
  deliberation,
  evidence,
  persistence,
  onReplay,
  onSettings,
  onExportProgress,
  testSession,
}: CourtWeekCompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const activeTestSession = COURT_WEEK_TEST_HARNESS_ENABLED ? testSession : undefined
  const testDay = activeTestSession?.sessions.find(
    ({ ordinal }) => ordinal === activeTestSession.selectedOrdinal,
  )?.day
  const completedSessions = sessions.filter(({ id }) => progress.completedSessionIds.includes(id))
  const outcome = deliberation.outcomePaths.find(({ verdict }) => verdict === progress.returnedVerdict)
  const evidenceLabels = useMemo(
    () => new Map(evidence.map(({ id, label }) => [id, label])),
    [evidence],
  )
  const contributions = progress.reasoningContributions ?? []
  const persistenceMessage = {
    indexeddb: 'Stored privately on this device. SimJury does not receive your result, reasoning trail or notes.',
    memory: 'Progress is held in this tab only. Export it before leaving or the completed result and notes will be lost.',
    pending: 'Your final device save is still being confirmed. You can export a copy now.',
    ephemeral: 'Temporary progress and private notes are discarded when you switch sessions or leave this session.',
  }[persistence]
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="cw-entry cw-complete" tabIndex={-1}>
      <div className="cw-entry__panel">
        <p className="cw-kicker">
          {activeTestSession ? 'Test session complete' : 'Private completion record'}
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {activeTestSession ? `${testDay ?? 'Session'} test complete` : 'Court Week complete'}
        </h1>
        <p className="cw-entry__advisory">
          Review your returned result, then open the parts of the record you want to revisit.
        </p>
        <p className="cw-complete__storage" role={persistence === 'indexeddb' ? undefined : 'status'}>
          {persistenceMessage}
        </p>

        <section className="cw-complete__result" aria-labelledby="cw-complete-result-heading">
          <h2 id="cw-complete-result-heading">Returned result</h2>
          <dl>
            <div><dt>Verdict</dt><dd>{progress.returnedVerdict ? verdictLabels[progress.returnedVerdict] : 'Not recorded'}</dd></div>
            <div><dt>Agreement</dt><dd>{progress.returnedAgreement ? agreementLabels[progress.returnedAgreement] : 'Not recorded'}</dd></div>
          </dl>
        </section>

        {onExportProgress ? (
          <section className="cw-complete__export" aria-labelledby="cw-complete-export-heading">
            <h2 id="cw-complete-export-heading">Keep a copy</h2>
            <p>Export your progress, ballots, returned result and reasoning trail. Private notes are omitted unless you opt in.</p>
            <label>
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(event) => setIncludeNotes(event.target.checked)}
              />
              Include my private notes in the export
            </label>
            <button type="button" onClick={() => onExportProgress(includeNotes)}>Export progress</button>
          </section>
        ) : null}

        {outcome ? (
          <details className="cw-complete__disclosure">
            <summary>Balanced reasoning for the returned result</summary>
            <div className="cw-complete__disclosure-body">
              <p>The strongest lawful reading is set beside the strongest counter-reading from the admitted record. Neither is ranked.</p>
              <h2>Strongest lawful rationale</h2>
              <p>{outcome.lawfulRationale}</p>
              <h2>Strongest counter-reading</h2>
              <p>{outcome.counterAnalysis}</p>
            </div>
          </details>
        ) : null}

        <details className="cw-complete__disclosure">
          <summary>Your saved reasoning trail <small>{contributions.length} contributions</small></summary>
          <div className="cw-complete__disclosure-body">
            <p>Each entry records the legal question, admitted evidence and reasoning move you selected.</p>
            {contributions.length ? (
              <ol className="cw-complete__trail">
                {contributions.map((contribution, index) => {
                  const day = sessions.find((session) => session.scenes.some(({ id }) => id === contribution.sceneId))?.day
                  return (
                    <li key={`${contribution.recordedAt}:${contribution.propositionId}`}>
                      <strong>{day ? `${day} contribution ${index + 1}` : `Contribution ${index + 1}`}</strong>
                      <dl>
                        <div><dt>Legal question</dt><dd>{contribution.legalQuestion}</dd></div>
                        <div><dt>Admitted evidence</dt><dd>{evidenceLabels.get(contribution.evidenceId) ?? 'Admitted exhibit'}</dd></div>
                        <div><dt>Reasoning move</dt><dd>{reasoningMoveLabels[contribution.move]}</dd></div>
                      </dl>
                    </li>
                  )
                })}
              </ol>
            ) : <p>No structured reasoning contributions were saved.</p>}
          </div>
        </details>

        <details className="cw-complete__disclosure">
          <summary>Completed-day history and replay <small>{completedSessions.length} of {sessions.length}</small></summary>
          <div className="cw-complete__disclosure-body">
            <p>Replay is read-only and does not change your notes, reasoning trail, ballots or returned result.</p>
            <nav className="cw-session-schedule" aria-label="Completed court sessions">
              <ol>
                {completedSessions.map((session) => (
                  <li key={session.id}>
                    <button type="button" onClick={() => onReplay(session)}>
                      <span>Replay {session.day}</span>
                      <small>{session.title}</small>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </details>

        {activeTestSession ? (
          <div className="cw-button-row" aria-label="Test session controls">
            <label htmlFor="cw-developer-day-complete">Test session</label>
            <select
              id="cw-developer-day-complete"
              value={activeTestSession.selectedOrdinal}
              onChange={(event) => activeTestSession.onSelect(Number(event.target.value))}
            >
              {activeTestSession.sessions.map(({ day, ordinal }) => (
                <option key={ordinal} value={ordinal}>{day}</option>
              ))}
            </select>
            <button type="button" onClick={activeTestSession.onLeave}>Leave test session</button>
          </div>
        ) : null}
        <button type="button" onClick={onSettings}>Presentation settings</button>
      </div>
    </main>
  )
}
