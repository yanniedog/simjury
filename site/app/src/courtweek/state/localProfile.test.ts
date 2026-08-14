import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearMemoryLocalProfileForTests,
  DEFAULT_LOCAL_PROFILE,
  LOCAL_PROFILE_SCHEMA_VERSION,
  LOCAL_PROFILE_STORAGE_KEY,
  loadLocalProfile,
  normaliseJurorLabel,
  resetLocalProfile,
  saveLocalProfile,
  type LocalProfileStorage,
} from './localProfile'

class MemoryStorage implements LocalProfileStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const profile = {
  jurorLabel: 'River',
  adultFictionAcknowledged: true,
}

describe('local profile state', () => {
  beforeEach(() => clearMemoryLocalProfileForTests())

  it('uses a safe default when the isolated profile key is absent', () => {
    const storage = new MemoryStorage()
    expect(loadLocalProfile(storage)).toEqual({
      profile: DEFAULT_LOCAL_PROFILE,
      persistence: 'local-storage',
      issue: null,
    })
  })

  it('round-trips only the versioned local profile record', () => {
    const storage = new MemoryStorage()
    const saved = saveLocalProfile(profile, storage)
    expect(saved).toEqual({
      profile: { schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION, ...profile },
      persistence: 'local-storage',
      issue: null,
    })
    expect([...storage.values.keys()]).toEqual([LOCAL_PROFILE_STORAGE_KEY])
    expect(loadLocalProfile(storage)).toEqual(saved)
  })

  it('normalises whitespace and control characters and caps labels at 32 code points', () => {
    expect(normaliseJurorLabel(' \tRiver\n\u0000  Quill\u202E ')).toBe('River Quill')
    expect(normaliseJurorLabel('')).toBe('Juror 01')
    expect(normaliseJurorLabel('A'.repeat(40))).toBe('A'.repeat(32))
    expect(saveLocalProfile({ ...profile, jurorLabel: undefined }, new MemoryStorage()).profile.jurorLabel)
      .toBe('Juror 01')
  })

  it('rejects corrupt, partial, wrong-version and extended records', () => {
    for (const value of [
      '{',
      JSON.stringify({ schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION }),
      JSON.stringify({ ...profile, schemaVersion: 'future-profile-v2' }),
      JSON.stringify({ schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION, ...profile, remoteId: 'not-allowed' }),
    ]) {
      const storage = new MemoryStorage()
      storage.values.set(LOCAL_PROFILE_STORAGE_KEY, value)
      expect(loadLocalProfile(storage)).toEqual({
        profile: DEFAULT_LOCAL_PROFILE,
        persistence: 'memory',
        issue: 'corrupt',
      })
    }
  })

  it('replaces a corrupt record with the safe public default', () => {
    const storage = new MemoryStorage()
    saveLocalProfile(profile, storage)
    storage.values.set(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 'future-profile-v2',
      ...profile,
    }))

    expect(loadLocalProfile(storage)).toEqual({
      profile: DEFAULT_LOCAL_PROFILE,
      persistence: 'memory',
      issue: 'corrupt',
    })

    expect(loadLocalProfile(null)).toEqual({
      profile: DEFAULT_LOCAL_PROFILE,
      persistence: 'memory',
      issue: 'unavailable',
    })
  })

  it('strips the retired developer field without losing acknowledgement', () => {
    const storage = new MemoryStorage()
    storage.values.set(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify({
      schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
      jurorLabel: 'River',
      adultFictionAcknowledged: true,
      developerMode: true,
    }))

    expect(loadLocalProfile(storage)).toEqual({
      profile: {
        schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
        jurorLabel: 'River',
        adultFictionAcknowledged: true,
      },
      persistence: 'local-storage',
      issue: null,
    })
    expect(JSON.parse(storage.values.get(LOCAL_PROFILE_STORAGE_KEY) ?? '{}')).toEqual({
      schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
      adultFictionAcknowledged: true,
      jurorLabel: 'River',
    })
  })

  it('keeps the last valid profile in memory when storage is blocked', () => {
    const durable = new MemoryStorage()
    saveLocalProfile(profile, durable)
    const blocked: LocalProfileStorage = {
      getItem: () => { throw new DOMException('Blocked', 'SecurityError') },
      setItem: () => { throw new DOMException('Blocked', 'SecurityError') },
      removeItem: () => { throw new DOMException('Blocked', 'SecurityError') },
    }
    expect(loadLocalProfile(blocked)).toEqual({
      profile: { schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION, ...profile },
      persistence: 'memory',
      issue: 'unavailable',
    })
    expect(saveLocalProfile({ ...profile, jurorLabel: 'Memory only' }, blocked)).toEqual({
      profile: {
        schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
        ...profile,
        jurorLabel: 'Memory only',
      },
      persistence: 'memory',
      issue: 'unavailable',
    })
  })

  it('resets only the exact profile key and leaves unrelated and progress data alone', () => {
    const storage = new MemoryStorage()
    storage.values.set(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile))
    storage.values.set('simjury:fiction-disclosure:v2', '1')
    storage.values.set('simjury:unrelated', 'keep')

    expect(resetLocalProfile(storage)).toEqual({
      profile: DEFAULT_LOCAL_PROFILE,
      persistence: 'local-storage',
      issue: null,
    })
    expect(storage.values.has(LOCAL_PROFILE_STORAGE_KEY)).toBe(false)
    expect(storage.values.get('simjury:fiction-disclosure:v2')).toBe('1')
    expect(storage.values.get('simjury:unrelated')).toBe('keep')
  })
})
