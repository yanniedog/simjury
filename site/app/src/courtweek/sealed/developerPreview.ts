import type { CourtWeek } from '../model/schema'
import type { StoredWeeklyProgress } from '../state/progress'

export const DEVELOPER_PREVIEW_NOW = Date.parse('2026-08-17T09:00:00+10:00')

export function developerProgressForDay(courtWeek: CourtWeek, ordinal: number): StoredWeeklyProgress {
  const session = courtWeek.manifest.sessions[ordinal - 1]
  const firstScene = session?.scenes[0]
  const firstCue = firstScene?.cues[0]
  if (!session || !firstScene || !firstCue) throw new Error('Developer preview day is unavailable.')
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: courtWeek.manifest.id,
    revision: courtWeek.manifest.revision,
    highestObservedTime: new Date(DEVELOPER_PREVIEW_NOW).toISOString(),
    completedSessionIds: courtWeek.manifest.sessions.slice(0, ordinal - 1).map(({ id }) => id),
    currentSessionId: session.id,
    currentSceneId: firstScene.id,
    currentCueId: firstCue.id,
    notes: '',
    reasoningContributions: [],
    majorityDirectionReceived: false,
    openCourtVerdictReturned: false,
    ...(ordinal === 7 ? { provisionalVote: 'unable-to-agree' as const } : {}),
  }
}
