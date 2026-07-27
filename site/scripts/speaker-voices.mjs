/**
 * Gender-aware Kokoro voice assignment for Daily Docket narration.
 *
 * Rules:
 * - Female speakers → female Kokoro voices; male speakers → male voices
 * - Judge → reserved gravitas voice (bm_george / bf_emma)
 * - Narrator → reserved af_heart
 * - Within a case, walk the gender pool so speakers stay as distinct as the
 *   catalog allows; clip ids fold the chosen voice so remaps stay corpus-safe
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CAST_GENDER = JSON.parse(
  readFileSync(join(here, '../app/src/lib/castGenders.json'), 'utf8'),
)

/** Warm, clear bench narrator — never reassigned to courtroom speakers. */
export const NARRATOR_VOICE = 'af_heart'

/** Wise British male with gravitas for male judges. */
export const JUDGE_VOICE_MALE = 'bm_george'

/** Authoritative British female for female judges. */
export const JUDGE_VOICE_FEMALE = 'bf_emma'

/** Distinct female English Kokoro voices (af_heart reserved for narrator). */
export const FEMALE_VOICES = [
  'af_bella',
  'af_nicole',
  'af_sarah',
  'af_kore',
  'af_aoede',
  'af_nova',
  'af_alloy',
  'bf_isabella',
  'bf_alice',
  'bf_lily',
  'af_jessica',
  'af_sky',
  'af_river',
  'bf_emma',
]

/** Distinct male English Kokoro voices (bm_george reserved for male judges). */
export const MALE_VOICES = [
  'am_fenrir',
  'am_michael',
  'am_puck',
  'am_onyx',
  'am_liam',
  'am_echo',
  'am_eric',
  'bm_fable',
  'bm_daniel',
  'bm_lewis',
  'am_adam',
  'am_santa',
]

const FEMALE_PREFERRED = {
  judge: JUDGE_VOICE_FEMALE,
  pc: 'af_bella',
  pros: 'af_bella',
  dc: 'af_nicole',
  defc: 'af_nicole',
  clerk: 'bf_alice',
  acc: 'af_kore',
  w1: 'af_aoede',
  w2: 'af_nova',
  w3: 'af_alloy',
  w4: 'bf_isabella',
  w5: 'af_sarah',
  'J-01': 'af_jessica',
  'J-02': 'af_sky',
  'J-03': 'af_river',
  'J-04': 'bf_lily',
  'J-05': 'bf_emma',
  'J-06': 'af_bella',
  'J-07': 'af_nicole',
  'J-08': 'af_kore',
  'J-09': 'bf_alice',
  'J-10': 'af_aoede',
  'J-11': 'af_nova',
}

const MALE_PREFERRED = {
  judge: JUDGE_VOICE_MALE,
  pc: 'am_fenrir',
  pros: 'am_fenrir',
  dc: 'am_michael',
  defc: 'am_michael',
  clerk: 'bm_daniel',
  acc: 'am_puck',
  w1: 'am_onyx',
  w2: 'am_liam',
  w3: 'am_echo',
  w4: 'am_eric',
  w5: 'bm_fable',
  'J-01': 'bm_lewis',
  'J-02': 'am_adam',
  'J-03': 'am_santa',
  'J-04': 'am_fenrir',
  'J-05': 'am_michael',
  'J-06': 'am_puck',
  'J-07': 'am_onyx',
  'J-08': 'am_liam',
  'J-09': 'am_echo',
  'J-10': 'am_eric',
  'J-11': 'bm_fable',
}

export function hash(value) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** Infer juror gender from persona self-reference; else stable mix by id. */
export function genderForJuror(persona, id) {
  const text = String(persona ?? '')
  const femaleSelf =
    /\b(distrusts herself|her skin crawl|her religion|argument for her|from her\b|offends her|speak to her|than she distrusts|survives her saying|retired her certainty|her least favourite|her particular attention)\b/i.test(
      text,
    ) || /\b(she keeps|she wants|she cannot|she will)\b/i.test(text)
  const maleSelf =
    /\b(on him\b|haunts him|undoing him|prying him|in his head|settles it for him|pulls him|reeling him|has him leaning|gnaws at him|working on him|for him\b|distrusts himself)\b/i.test(
      text,
    ) || /\b(he keeps|he wants|he cannot|he will|he finished|he digs)\b/i.test(text)
  if (femaleSelf && !maleSelf) return 'female'
  if (maleSelf && !femaleSelf) return 'male'
  return hash(id) % 2 === 0 ? 'female' : 'male'
}

export function genderForCastMember(member) {
  if (member?.gender === 'female' || member?.gender === 'male') return member.gender
  const named = CAST_GENDER[member?.name]
  if (named === 'female' || named === 'male') return named
  const role = String(member?.role_label ?? '')
  if (/\b(woman|female|she)\b/i.test(role)) return 'female'
  if (/\b(man who|male)\b/i.test(role)) return 'male'
  console.warn(`speaker-voices: unknown gender for cast "${member?.name}" (${member?.id}); defaulting by id hash`)
  return hash(String(member?.id ?? 'x')) % 2 === 0 ? 'female' : 'male'
}

function preferredVoice(speakerId, gender) {
  if (speakerId === 'narrator') return NARRATOR_VOICE
  const fixed = gender === 'female' ? FEMALE_PREFERRED[speakerId] : MALE_PREFERRED[speakerId]
  if (fixed) return fixed
  const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES
  return pool[hash(`${speakerId}\0${gender}`) % pool.length]
}

function pickUnique(pool, used, preferred, key) {
  if (preferred && !used.has(preferred) && pool.includes(preferred)) return preferred
  const start = hash(key) % pool.length
  for (let i = 0; i < pool.length; i++) {
    const voice = pool[(start + i) % pool.length]
    if (!used.has(voice)) return voice
  }
  return preferred && pool.includes(preferred) ? preferred : pool[start]
}

/**
 * Deterministic per-case assignment. Same cast/juror gender set ⇒ same map.
 * @param {{ cast?: object[], jury?: { jurors?: object[] } }} docket
 */
export function assignKokoroVoices(docket) {
  const voices = new Map()
  const genders = new Map()
  const used = new Set()

  voices.set('narrator', NARRATOR_VOICE)
  genders.set('narrator', 'female')
  used.add(NARRATOR_VOICE)

  const cast = [...(docket.cast ?? [])].sort((a, b) => a.id.localeCompare(b.id))
  const jurors = [...(docket.jury?.jurors ?? [])].sort((a, b) => a.id.localeCompare(b.id))

  // Judge first so gravitas voices are reserved before the general walk.
  const ordered = [
    ...cast.filter((m) => m.id === 'judge'),
    ...cast.filter((m) => m.id !== 'judge'),
    ...jurors,
  ]

  for (const member of ordered) {
    const id = member.id
    const gender = Object.prototype.hasOwnProperty.call(member, 'persona')
      ? genderForJuror(member.persona, id)
      : genderForCastMember(member)
    genders.set(id, gender)
    const preferred = preferredVoice(id, gender)
    if (id === 'judge') {
      // Gravitas voices are reserved even when they sit outside the general walk.
      voices.set(id, preferred)
      used.add(preferred)
      continue
    }
    const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES
    const voice = pickUnique(pool, used, preferred, id)
    voices.set(id, voice)
    used.add(voice)
  }

  return { voices, genders }
}
