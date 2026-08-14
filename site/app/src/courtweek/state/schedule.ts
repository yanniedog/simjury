export interface UnlockableSession {
  id: string
  unlockAt: string
  prerequisites: readonly string[]
}

export interface SessionAvailability {
  id: string
  unlocked: boolean
  ready: boolean
  missingPrerequisites: string[]
  unlockAt: string
}

export function observeCourtTime(
  previousHighest: number,
  observedNow = Date.now(),
): number {
  return Math.max(previousHighest, observedNow)
}

export function getSessionAvailability(
  sessions: readonly UnlockableSession[],
  completedSessionIds: readonly string[],
  observedNow: number,
): SessionAvailability[] {
  const completed = new Set(completedSessionIds)

  return sessions.map((session) => {
    const unlockTime = Date.parse(session.unlockAt)
    const missingPrerequisites = session.prerequisites.filter(
      (id) => !completed.has(id),
    )

    return {
      id: session.id,
      unlocked: Number.isFinite(unlockTime) && observedNow >= unlockTime,
      ready:
        Number.isFinite(unlockTime) &&
        observedNow >= unlockTime &&
        missingPrerequisites.length === 0,
      missingPrerequisites,
      unlockAt: session.unlockAt,
    }
  })
}

export function formatCourtUnlock(
  unlockAt: string,
  locale = 'en-AU',
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Hobart',
    timeZoneName: 'short',
  }).format(new Date(unlockAt))
}
