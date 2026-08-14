import { useEffect, useRef, useState } from 'react'
import type { CourtSession } from '../model/schema'

export interface CourtWeekCompletionProps {
  sessions: CourtSession[]
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
  persistence,
  onReplay,
  onSettings,
  onExportProgress,
  testSession,
}: CourtWeekCompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  const testDay = testSession?.sessions.find(
    ({ ordinal }) => ordinal === testSession.selectedOrdinal,
  )?.day
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="cw-entry cw-complete" tabIndex={-1}>
      <div className="cw-entry__panel">
        <p className="cw-kicker">
          {testSession ? 'Test session complete' : 'The court week has concluded'}
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {testSession ? `${testDay ?? 'Session'} test complete` : 'Court Week complete'}
        </h1>
        {persistence === 'memory' ? (
          <div className="cw-complete__persistence-warning">
            <p role="status">
              Progress is held in this tab only. Export it before leaving or the
              completed verdict and notes will be lost.
            </p>
            {onExportProgress ? (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(event) => setIncludeNotes(event.target.checked)}
                  />
                  Include my private notes in the export
                </label>
                <button type="button" onClick={() => onExportProgress(includeNotes)}>Export progress</button>
              </>
            ) : null}
          </div>
        ) : null}
        <p>{testSession
          ? 'Choose another session to inspect, replay this session, or leave the test session.'
          : 'The complete record remains available. Replaying a session does not change your private notes, reasoning contributions, sealed ballots or returned result.'}
        </p>
        <nav className="cw-session-schedule" aria-label="Completed court sessions">
          <ol>
            {sessions.map((session) => (
              <li key={session.id}>
                <button type="button" onClick={() => onReplay(session)}>
                  <span>Replay {session.day}</span>
                  <small>{session.title}</small>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {testSession ? (
          <div className="cw-button-row" aria-label="Test session controls">
            <label htmlFor="cw-developer-day-complete">Test session</label>
            <select
              id="cw-developer-day-complete"
              value={testSession.selectedOrdinal}
              onChange={(event) => testSession.onSelect(Number(event.target.value))}
            >
              {testSession.sessions.map(({ day, ordinal }) => (
                <option key={ordinal} value={ordinal}>{day}</option>
              ))}
            </select>
            <button type="button" onClick={testSession.onLeave}>Leave test session</button>
          </div>
        ) : null}
        {persistence === 'ephemeral' ? (
          <p role="status">
            Temporary progress and private notes are discarded when you switch sessions or leave this session.
          </p>
        ) : null}
        <button type="button" onClick={onSettings}>Presentation settings</button>
      </div>
    </main>
  )
}
