import { useEffect, useRef, useState } from 'react'
import type { CourtSession } from '../model/schema'

export interface CourtWeekCompletionProps {
  sessions: CourtSession[]
  persistence: 'indexeddb' | 'memory' | 'pending'
  onReplay: (session: CourtSession) => void
  onSettings: () => void
  onExportProgress?: (includePrivateNotes: boolean) => void
}

export function CourtWeekCompletion({
  sessions,
  persistence,
  onReplay,
  onSettings,
  onExportProgress,
}: CourtWeekCompletionProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [includeNotes, setIncludeNotes] = useState(false)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main className="cw-entry cw-complete">
      <div className="cw-entry__panel">
        <p className="cw-kicker">The court week has concluded</p>
        <h1 ref={headingRef} tabIndex={-1}>Court Week complete</h1>
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
