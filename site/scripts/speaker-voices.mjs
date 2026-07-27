/**
 * Gender-aware narration voice assignment for Daily Docket.
 *
 * Rules:
 * - Female speakers → female Kokoro voice ids; male → male Kokoro voice ids
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
const VOICE_BANK = JSON.parse(readFileSync(join(here, '../app/src/lib/narrationVoices.json'), 'utf8'))

/** Highest-grade Kokoro female narrator — never reassigned to courtroom speakers. */
export const NARRATOR_VOICE = 'af_heart'

/** British masculine gravitas for male judges. */
export const JUDGE_VOICE_MALE = 'bm_george'

/** Warm British feminine timbre for female judges. */
export const JUDGE_VOICE_FEMALE = 'bf_emma'

/** Distinct female English Kokoro voices (af_heart narrator, bf_emma female judges). */
export const FEMALE_VOICES = VOICE_BANK.female
  .map((v) => v.id)
  .filter((id) => id !== NARRATOR_VOICE && id !== JUDGE_VOICE_FEMALE)

/** Distinct male English Kokoro voices (bm_george reserved for male judges). */
export const MALE_VOICES = VOICE_BANK.male
  .map((v) => v.id)
  .filter((id) => id !== JUDGE_VOICE_MALE)

const FEMALE_PREFERRED = {
  judge: JUDGE_VOICE_FEMALE,
  pc: 'af_bella',
  pros: 'af_bella',
  dc: 'bf_isabella',
  defc: 'bf_alice',
  clerk: 'af_alloy',
  acc: 'af_sky',
  w1: 'af_nicole',
  w2: 'bf_isabella',
  w3: 'af_nova',
  w4: 'af_sarah',
  w5: 'af_aoede',
  'J-01': 'af_kore',
  'J-02': 'bf_alice',
  'J-03': 'af_nicole',
  'J-04': 'bf_isabella',
  'J-05': 'af_nova',
  'J-06': 'af_bella',
  'J-07': 'af_alloy',
  'J-08': 'af_sarah',
  'J-09': 'af_aoede',
  'J-10': 'af_sky',
  'J-11': 'af_kore',
}

const MALE_PREFERRED = {
  judge: JUDGE_VOICE_MALE,
  pc: 'bm_lewis',
  pros: 'bm_lewis',
  dc: 'bm_lewis',
  defc: 'bm_lewis',
  clerk: 'am_eric',
  acc: 'am_liam',
  w1: 'am_michael',
  w2: 'am_fenrir',
  w3: 'am_puck',
  w4: 'am_echo',
  w5: 'am_onyx',
  'J-01': 'bm_daniel',
  'J-02': 'am_adam',
  'J-03': 'bm_fable',
  'J-04': 'am_michael',
  'J-05': 'am_fenrir',
  'J-06': 'am_puck',
  'J-07': 'am_echo',
  'J-08': 'am_onyx',
  'J-09': 'am_eric',
  'J-10': 'am_liam',
  'J-11': 'am_adam',
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
