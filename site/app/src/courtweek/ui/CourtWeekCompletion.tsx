import { useEffect, useRef } from 'react'
import type { CourtSession } from '../model/schema'

export interface CourtWeekCompletionProps {
  sessions: CourtSession[]
  persistence: 'indexeddb' | 'memory' | 'pending'
  onReplay: (session: CourtSession) => void
  onSettings: () => void
  onExportProgress?: () => void
}

export function CourtWeekCompletion({
  sessions,
  persistence,
  onReplay,
  onSettings,
  onExportProgress,
}: CourtWeekCompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="cw-entry cw-complete">
      <div className="cw-entry__panel">
        <p className="cw-kicker">The court week has concluded</p>
        <h1 ref={headingRef} tabIndex={-1}>Court Week complete</h1>
        {persistence === 'memory' ? (
          <p role="status" className="cw-complete__persistence-warning">
            Progress is held in this tab only. Export it before leaving or the
            completed verdict and notes will be lost.
            {onExportProgress ? (
              <>
                {' '}
                <button type="button" onClick={onExportProgress}>Export progress</button>
              </>
            ) : null}
          </p>
        ) : null}
        <p>
          The complete record remains available. Replaying a session does not
          change your private notes, reasoning contributions, sealed ballots or
          returned result.
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
        <button type="button" onClick={onSettings}>Presentation settings</button>
      </div>
    </main>
  )
}
