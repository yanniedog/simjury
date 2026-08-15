import type { CourtWeek, Verdict } from '../model/schema'
import type { AccessMode, StoredWeeklyProgress } from '../state/progress'

export const DEVELOPER_PREVIEW_PATH = '/__court-week-preview'
export const DEVELOPER_PREVIEW_NOW_ISO = '2026-08-17T09:00:00+10:00'
export const DEVELOPER_PREVIEW_NOW = Date.parse(DEVELOPER_PREVIEW_NOW_ISO)
export const DEVELOPER_PREVIEW_ASSET_MARKERS = [
  DEVELOPER_PREVIEW_PATH,
  'VITE_COURT_WEEK_PREVIEW',
  'cw-preview-harness',
  'cw-preview-drawer',
  'COURT WEEK PREVIEW',
  'cw-test-harness',
  'cw-developer-toolbar',
  'cw-developer-day',
  'DEV PREVIEW',
  'Test session controls',
  'cw-preview-fresh-unanimity-fixture',
] as const

export type PreviewAdmissionState = 'at-cue' | 'include-provisional' | 'all-admitted'
export type PreviewOutcome = 'none' | `${Verdict}:${'unanimous' | 'majority' | 'hung'}`
export interface DeveloperPreviewSelection {
  sceneId?: string
  cueId?: string
  accessMode?: AccessMode
  ballot?: Verdict | 'auto'
  outcome?: PreviewOutcome
}

/** Dev/test-only future-session fixture; never replaces the sealed published pack. */
export function withDeveloperFreshUnanimityBallot(courtWeek: CourtWeek): CourtWeek {
  const sundayIndex = courtWeek.manifest.sessions.findIndex(({ day }) => day === 'Sunday')
  const sunday = courtWeek.manifest.sessions[sundayIndex]
  if (!sunday || sunday.scenes.some(({ id }) => id === 'sun-fresh-unanimity-ballot')) return courtWeek
  const majorityIndex = sunday.scenes.findIndex(({ id }) => id === 'sun-majority')
  const source = sunday.scenes.find(({ id }) => id === 'sun-second-ballot')
  if (majorityIndex < 0 || !source) throw new Error('Developer fresh-ballot fixture cannot be placed.')
  const freshScene: typeof source = {
    ...source,
    id: 'sun-fresh-unanimity-ballot',
    title: 'Fresh private unanimity ballot (test only)',
    cues: [{
      id: 'sun-fresh-unanimity-ballot', event: 'fresh-unanimity-ballot',
      speaker: 'Foreperson', tone: 'deliberation', evidenceIds: [], replayable: false,
      text: 'A test-only fresh private ballot follows further discussion. Only whether unanimity was reached may leave the jury room.',
      accessibleProposition: 'A fresh private unanimity ballot reports no vote or split.',
    }],
    interaction: {
      kind: 'fresh-unanimity-vote',
      prompt: 'Cast a fresh private vote. Only whether unanimity was reached will be reported.',
      options: ['Murder', 'Manslaughter', 'Not Guilty', 'Unable to agree'],
    },
  }
  const sessions = [...courtWeek.manifest.sessions]
  sessions[sundayIndex] = {
    ...sunday,
    scenes: [...sunday.scenes.slice(0, majorityIndex), freshScene, ...sunday.scenes.slice(majorityIndex)],
  }
  return { ...courtWeek, manifest: { ...courtWeek.manifest, sessions } }
}

export function developerProgressForDay(
  courtWeek: CourtWeek,
  ordinal: number,
  selection: DeveloperPreviewSelection = {},
): StoredWeeklyProgress {
  const session = courtWeek.manifest.sessions[ordinal - 1]
  const scene = session?.scenes.find(({ id }) => id === selection.sceneId) ?? session?.scenes[0]
  const cue = scene?.cues.find(({ id }) => id === selection.cueId) ?? scene?.cues[0]
  if (!session || !scene || !cue) throw new Error('Developer preview position is unavailable.')
  const ballot = selection.ballot === 'auto' || !selection.ballot
    ? (ordinal === 7 ? 'unable-to-agree' : undefined)
    : selection.ballot
  const outcome = selection.outcome && selection.outcome !== 'none'
    ? selection.outcome.split(':') as [Verdict, 'unanimous' | 'majority' | 'hung']
    : null
  const returned = Boolean(outcome && scene.id === 'sun-analysis')
  const freshIndex = session.scenes.findIndex(({ id }) => id === 'sun-fresh-unanimity-ballot')
  const selectedIndex = session.scenes.findIndex(({ id }) => id === scene.id)
  const usesFreshJourney = freshIndex >= 0 && (!outcome || outcome[1] !== 'unanimous')
  const reachedFreshBallot = usesFreshJourney && selectedIndex >= freshIndex
  const passedFreshBallot = usesFreshJourney && selectedIndex > freshIndex
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: courtWeek.manifest.id,
    revision: courtWeek.manifest.revision,
    highestObservedTime: new Date(DEVELOPER_PREVIEW_NOW).toISOString(),
    completedSessionIds: courtWeek.manifest.sessions.slice(0, ordinal - 1).map(({ id }) => id),
    currentSessionId: session.id,
    currentSceneId: scene.id,
    currentCueId: cue.id,
    notes: '',
    accessibilityMode: selection.accessMode ?? 'reading',
    reasoningContributions: [],
    majorityDirectionReceived: outcome ? outcome[1] !== 'unanimous' : false,
    openCourtVerdictReturned: returned,
    ...(ballot ? { provisionalVote: ballot } : {}),
    ...(reachedFreshBallot && ballot ? {
      secondVote: ballot, secondBallotWasUnanimous: false,
    } : {}),
    ...(passedFreshBallot && ballot ? {
      freshUnanimityVote: ballot, freshBallotWasUnanimous: false,
    } : {}),
    ...(outcome ? {
      secondVote: outcome[0],
      secondBallotWasUnanimous: outcome[1] === 'unanimous',
      ...(passedFreshBallot && outcome[1] !== 'unanimous'
        ? { freshUnanimityVote: outcome[0], freshBallotWasUnanimous: false }
        : {}),
      ...(outcome[1] === 'unanimous' ? {} : { finalVote: outcome[0] }),
      sealedVerdict: outcome[0],
      sealedAgreement: outcome[1],
      ...(returned ? { returnedVerdict: outcome[0], returnedAgreement: outcome[1] } : {}),
    } : {}),
  }
}
