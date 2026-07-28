/**
 * Experimental alternate narration engine (Scylla's Band).
 *
 * Removable: set enabled:false in narrationAltVoice.json, or delete this module,
 * the JSON, DocketChrome/App wiring, site/scripts/*scylla*, and
 * .github/workflows/scylla-narration.yml.
 */
import catalog from './narrationAltVoice.json'
import type { SpeakerGender } from './speakerVoices'

export const ALT_VOICE_MODE_ENABLED = catalog.enabled === true
export const ALT_VOICE_ENGINE_ID = 'scylla' as const
export type AltVoiceEngineId = typeof ALT_VOICE_ENGINE_ID
export type NarrationEngineId = 'kokoro' | AltVoiceEngineId

export const ALT_VOICE_RELEASE_PREFIX = catalog.releasePrefix
export const ALT_VOICE_LABEL = catalog.label
export const DEFAULT_VOICE_LABEL = catalog.defaultLabel

const NARRATOR = catalog.narrator
const FEMALE_POOL = catalog.female
const MALE_POOL = catalog.male
const FEMALE_PREFERRED = catalog.femalePreferred as Record<string, string>
const MALE_PREFERRED = catalog.malePreferred as Record<string, string>
const LANGUAGES = catalog.languages as Record<string, string>

function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function pickUnique(
  pool: readonly string[],
  used: Set<string>,
  preferred: string,
  key: string,
): string {
  if (preferred && !used.has(preferred) && pool.includes(preferred)) return preferred
  const start = hash(key) % pool.length
  for (let i = 0; i < pool.length; i++) {
    const voice = pool[(start + i) % pool.length]
    if (!used.has(voice)) return voice
  }
  return pool.includes(preferred) ? preferred : pool[start]
}

function preferredVoice(speakerId: string, gender: SpeakerGender): string {
  if (speakerId === 'narrator') return NARRATOR
  const fixed = gender === 'female' ? FEMALE_PREFERRED[speakerId] : MALE_PREFERRED[speakerId]
  if (fixed) return fixed
  const pool = gender === 'female' ? FEMALE_POOL : MALE_POOL
  return pool[hash(`${speakerId}\0${gender}`) % pool.length]
}

/** Deterministic Scylla voice map mirroring buildSpeakerVoicePlan uniqueness rules. */
export function buildAltVoiceByKey(input: {
  genderByKey: Map<string, SpeakerGender>
  keys: string[]
}): Map<string, string> {
  const byKey = new Map<string, string>()
  const used = new Set<string>()
  byKey.set('narrator', NARRATOR)
  used.add(NARRATOR)

  const ordered = [
    ...input.keys.filter((k) => k === 'judge'),
    ...input.keys.filter((k) => k !== 'judge' && k !== 'narrator'),
  ]
  for (const id of ordered) {
    const gender = input.genderByKey.get(id) ?? 'female'
    const preferred = preferredVoice(id, gender)
    if (id === 'judge') {
      byKey.set(id, preferred)
      used.add(preferred)
      continue
    }
    const pool = gender === 'female' ? FEMALE_POOL : MALE_POOL
    const voice = pickUnique(pool, used, preferred, id)
    byKey.set(id, voice)
    used.add(voice)
  }
  return byKey
}

export function altVoiceLanguage(voiceId: string): string {
  return LANGUAGES[voiceId] ?? 'en_us'
}

export function altVoiceModeAvailable(): boolean {
  return ALT_VOICE_MODE_ENABLED
}

export function normaliseNarrationEngine(value: unknown): NarrationEngineId {
  if (value === ALT_VOICE_ENGINE_ID && ALT_VOICE_MODE_ENABLED) return ALT_VOICE_ENGINE_ID
  return 'kokoro'
}
