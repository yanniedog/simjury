export const LOCAL_PROFILE_STORAGE_KEY = 'simjury:court-week:local-profile:v1'
export const LOCAL_PROFILE_SCHEMA_VERSION = 'simjury-local-profile-v1' as const
export const DEFAULT_JUROR_LABEL = 'Juror 01'

export interface LocalProfile {
  schemaVersion: typeof LOCAL_PROFILE_SCHEMA_VERSION
  jurorLabel: string
  adultFictionAcknowledged: boolean
  developerMode: boolean
}

export interface LocalProfileInput {
  jurorLabel?: string
  adultFictionAcknowledged: boolean
  developerMode: boolean
}

export type LocalProfilePersistence = 'local-storage' | 'memory'
export type LocalProfileIssue = 'unavailable' | 'corrupt' | null

export interface LocalProfileResult {
  profile: LocalProfile
  persistence: LocalProfilePersistence
  issue: LocalProfileIssue
}

export interface LocalProfileStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const DEFAULT_LOCAL_PROFILE: Readonly<LocalProfile> = Object.freeze({
  schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
  jurorLabel: DEFAULT_JUROR_LABEL,
  adultFictionAcknowledged: false,
  developerMode: false,
})

let memoryProfile: LocalProfile = { ...DEFAULT_LOCAL_PROFILE }

function browserStorage(): LocalProfileStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function normaliseJurorLabel(value?: string): string {
  if (typeof value !== 'string') return DEFAULT_JUROR_LABEL
  const normalised = value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  return Array.from(normalised).slice(0, 32).join('') || DEFAULT_JUROR_LABEL
}

export function normaliseLocalProfile(input: LocalProfileInput): LocalProfile {
  return {
    schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
    jurorLabel: normaliseJurorLabel(input.jurorLabel),
    adultFictionAcknowledged: input.adultFictionAcknowledged === true,
    developerMode: input.developerMode === true,
  }
}

function parseStoredProfile(value: string): LocalProfile | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const record = parsed as Record<string, unknown>
    const allowed = new Set([
      'schemaVersion',
      'jurorLabel',
      'adultFictionAcknowledged',
      'developerMode',
    ])
    if (Object.keys(record).some((key) => !allowed.has(key))) return null
    if (
      record.schemaVersion !== LOCAL_PROFILE_SCHEMA_VERSION ||
      (record.jurorLabel !== undefined && typeof record.jurorLabel !== 'string') ||
      typeof record.adultFictionAcknowledged !== 'boolean' ||
      typeof record.developerMode !== 'boolean'
    ) return null
    return normaliseLocalProfile({
      ...(record.jurorLabel === undefined ? {} : { jurorLabel: record.jurorLabel }),
      adultFictionAcknowledged: record.adultFictionAcknowledged,
      developerMode: record.developerMode,
    })
  } catch {
    return null
  }
}

export function loadLocalProfile(storage = browserStorage()): LocalProfileResult {
  if (!storage) {
    return { profile: { ...memoryProfile }, persistence: 'memory', issue: 'unavailable' }
  }
  try {
    const stored = storage.getItem(LOCAL_PROFILE_STORAGE_KEY)
    if (stored === null) {
      memoryProfile = { ...DEFAULT_LOCAL_PROFILE }
      return { profile: { ...memoryProfile }, persistence: 'local-storage', issue: null }
    }
    const profile = parseStoredProfile(stored)
    if (!profile) {
      memoryProfile = { ...DEFAULT_LOCAL_PROFILE }
      return { profile: { ...memoryProfile }, persistence: 'memory', issue: 'corrupt' }
    }
    memoryProfile = profile
    return { profile: { ...profile }, persistence: 'local-storage', issue: null }
  } catch {
    return { profile: { ...memoryProfile }, persistence: 'memory', issue: 'unavailable' }
  }
}

export function saveLocalProfile(
  input: LocalProfileInput,
  storage = browserStorage(),
): LocalProfileResult {
  const profile = normaliseLocalProfile(input)
  memoryProfile = profile
  if (!storage) {
    return { profile: { ...profile }, persistence: 'memory', issue: 'unavailable' }
  }
  try {
    storage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile))
    return { profile: { ...profile }, persistence: 'local-storage', issue: null }
  } catch {
    return { profile: { ...profile }, persistence: 'memory', issue: 'unavailable' }
  }
}

export function resetLocalProfile(storage = browserStorage()): LocalProfileResult {
  memoryProfile = { ...DEFAULT_LOCAL_PROFILE }
  if (!storage) {
    return { profile: { ...memoryProfile }, persistence: 'memory', issue: 'unavailable' }
  }
  try {
    storage.removeItem(LOCAL_PROFILE_STORAGE_KEY)
    return { profile: { ...memoryProfile }, persistence: 'local-storage', issue: null }
  } catch {
    return { profile: { ...memoryProfile }, persistence: 'memory', issue: 'unavailable' }
  }
}

export function clearMemoryLocalProfileForTests(): void {
  memoryProfile = { ...DEFAULT_LOCAL_PROFILE }
}
