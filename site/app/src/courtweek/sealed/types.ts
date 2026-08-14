import type {
  CourtSession,
  DeliberationPack,
  EvidenceItem,
  TrialRecord,
} from '../model/schema'
import type { CourtWeekSessionMedia } from '../media/manifest'

export interface CourtWeekScheduleEntry {
  id: string
  ordinal: number
  day: CourtSession['day']
  unlockAt: string
  prerequisiteSessionIds: string[]
  locator: string
}

export interface CourtWeekBootstrap {
  schemaVersion: 'court-week-sealed-v1'
  id: 'cw-0001'
  revision: string
  label: 'fiction'
  title: 'Eleven Minutes'
  subtitle: string
  contentAdvisory: string
  timezone: 'Australia/Hobart'
  releaseTag: string
  sessions: CourtWeekScheduleEntry[]
}

export type TrialBase = Omit<TrialRecord, 'evidence' | 'witnesses' | 'objections'>

export interface CourtDayPack {
  schema: 'simjury.court-day-pack/v1'
  caseId: 'cw-0001'
  revision: string
  ordinal: number
  session: CourtSession
  trialBase?: TrialBase
  evidence: EvidenceItem[]
  deliberation?: DeliberationPack
  media?: CourtWeekSessionMedia
}

export interface SealedPackEnvelope {
  schema: 'simjury.sealed-court-day/v1'
  caseId: 'cw-0001'
  revision: string
  ordinal: number
  iv: string
  ciphertext: string
}
