import { describe, expect, it } from 'vitest'
import {
  GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST,
  GOOGLE_CHIRP3_INVENTORY_DIGEST,
  GOOGLE_CHIRP3_PRICING_DIGEST,
  GOOGLE_CHIRP3_SOURCE,
  validateGoogleChirp3Source,
} from './court-week-chirp-source'

describe('frozen Google Chirp 3 HD source evidence', () => {
  it('pins the complete documented en-AU inventory without selecting a cast', () => {
    const source = validateGoogleChirp3Source(GOOGLE_CHIRP3_SOURCE)
    expect(source.inventory.voices).toHaveLength(30)
    expect(source.inventory.voices.filter(({ presentedGender }) => presentedGender === 'female')).toHaveLength(14)
    expect(source.inventory.voices.filter(({ presentedGender }) => presentedGender === 'male')).toHaveLength(16)
    expect(source.inventory.voices.at(0)?.voiceId).toBe('en-AU-Chirp3-HD-Achernar')
    expect(source.inventory.voices.at(-1)?.voiceId).toBe('en-AU-Chirp3-HD-Zubenelgenubi')
    expect(GOOGLE_CHIRP3_INVENTORY_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('pins the provider price and a dated RBA conversion separately', () => {
    expect(GOOGLE_CHIRP3_SOURCE.pricing).toMatchObject({
      billingRequired: true, freeTierCharactersPerMonth: 1_000_000,
      usdMicrosPerMillionCharactersAfterFreeTier: 30_000_000,
    })
    expect(GOOGLE_CHIRP3_PRICING_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(GOOGLE_CHIRP3_AUD_CONVERSION_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/u)
    const providerCharacters = 45_260
    const grossUsdMicros = providerCharacters * 30
    const grossAudMicros = Math.ceil(grossUsdMicros * GOOGLE_CHIRP3_SOURCE.audConversion.audMicrosPerUsd / 1_000_000)
    expect(grossUsdMicros).toBe(1_357_800)
    expect(grossAudMicros).toBe(1_921_053)
    expect(providerCharacters).toBeLessThan(GOOGLE_CHIRP3_SOURCE.pricing.freeTierCharactersPerMonth)
  })

  it('rejects catalogue drift and misleading gender totals', () => {
    const duplicate = structuredClone(GOOGLE_CHIRP3_SOURCE)
    duplicate.inventory.voices[1]!.voiceId = duplicate.inventory.voices[0]!.voiceId
    expect(() => validateGoogleChirp3Source(duplicate)).toThrow(/distinct voice ids/i)
    const relabelled = structuredClone(GOOGLE_CHIRP3_SOURCE)
    relabelled.inventory.voices[0]!.presentedGender = 'male'
    expect(() => validateGoogleChirp3Source(relabelled)).toThrow(/14 female and 16 male/i)
  })
})
