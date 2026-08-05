import type { CourtWeek } from '../model/schema'
import type { StoredWeeklyProgress } from '../state/progress'

const DEVELOPER_TOKEN_DOMAIN = 'simjury:court-week:developer:v1\0'
const EXPECTED_DEVELOPER_DIGEST = 'bd577d03603337920320fc8cac21067af2f8e25e7e863a095379735a8cb12e78'

export const DEVELOPER_PREVIEW_NOW = Date.parse('2026-08-17T09:00:00+10:00')

export async function digestDeveloperToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${DEVELOPER_TOKEN_DOMAIN}${token}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyDeveloperToken(
  token: string,
  expectedDigest = EXPECTED_DEVELOPER_DIGEST,
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const actual = await digestDeveloperToken(token)
  let mismatch = actual.length ^ expectedDigest.length
  for (let index = 0; index < expectedDigest.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expectedDigest.charCodeAt(index)
  }
  return mismatch === 0
}

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
