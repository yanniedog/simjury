import { describe, expect, it } from 'vitest'
import type { Juror } from '../lib/v2/caseSchema'
import { jurorProfile, jurorProfiles, profileIndex } from './jurorProfile'

const baseJuror = {
  id: 'J-01',
  seat: 2,
  label: 'Juror 2 — Anya',
  persona: 'Starts with the vivid lobby image, then asks whether its timestamp deserves the same confidence.',
  register: 'plain',
  arc: 'vibes',
  weights: { identity: 2, timeline: 1, procedure: -1 },
  initial: { position: 'G', confidence: 60 },
} as Juror

describe('jurorProfile', () => {
  it('projects a stable deterministic dossier from authored fields', () => {
    const profile = jurorProfile(baseJuror)
    expect(profile.id).toBe('J-01')
    expect(profile.persona).toBe(baseJuror.persona)
    expect(profile.caresAbout).toEqual(['identity'])
    expect(profile.notices).toEqual(['timeline'])
    expect(profile.wary).toEqual(['procedure'])
    expect(profile.focus).toBe('identity')
    expect(profile.traits.conviction).toBe(0.6)
    expect(Object.values(profile.traits).every((v) => v >= 0 && v <= 1)).toBe(true)
    expect(jurorProfile(baseJuror)).toEqual(profile)
  })

  it('indexes a panel by id', () => {
    const profiles = jurorProfiles([baseJuror])
    expect(profiles).toHaveLength(1)
    expect(profileIndex([baseJuror]).get('J-01')).toEqual(profiles[0])
  })
})
