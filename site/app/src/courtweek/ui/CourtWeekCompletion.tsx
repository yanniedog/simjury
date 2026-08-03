import type { CourtSession } from '../model/schema'

export interface CourtWeekCompletionProps {
  sessions: CourtSession[]
  onReplay: (session: CourtSession) => void
  onSettings: () => void
}

export function CourtWeekCompletion({
  sessions,
  onReplay,
  onSettings,
}: CourtWeekCompletionProps) {
  return (
    <main className="cw-entry cw-complete">
      <div className="cw-entry__panel">
        <p className="cw-kicker">The court week has concluded</p>
        <h1>Court Week complete</h1>
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
