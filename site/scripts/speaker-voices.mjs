/**
 * Gender-aware narration voice assignment for Daily Docket.
 *
 * Rules:
 * - Female speakers → female Qwen VoiceDesign bank ids; male → male bank ids
 * - Judge → reserved gravitas voice (m_baritone_judge / f_counsel_warm)
 * - Narrator → reserved f_narrator_clear
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

/** Warm, clear bench narrator — never reassigned to courtroom speakers. */
export const NARRATOR_VOICE = 'f_narrator_clear'

/** Deep masculine gravitas for male judges. */
export const JUDGE_VOICE_MALE = 'm_baritone_judge'

/** Authoritative feminine counsel-adjacent timbre for female judges. */
export const JUDGE_VOICE_FEMALE = 'f_counsel_warm'

/** Distinct female English Qwen bank voices (f_narrator_clear reserved for narrator). */
export const FEMALE_VOICES = VOICE_BANK.female
  .map((v) => v.id)
  .filter((id) => id !== NARRATOR_VOICE)

/** Distinct male English Qwen bank voices (m_baritone_judge reserved for male judges). */
export const MALE_VOICES = VOICE_BANK.male
  .map((v) => v.id)
  .filter((id) => id !== JUDGE_VOICE_MALE)

const FEMALE_PREFERRED = {
  judge: JUDGE_VOICE_FEMALE,
  pc: 'f_counsel_sharp',
  pros: 'f_counsel_sharp',
  dc: 'f_counsel_warm',
  defc: 'f_counsel_warm',
  clerk: 'f_clerk_bright',
  acc: 'f_accused_strained',
  w1: 'f_witness_soft',
  w2: 'f_witness_firm',
  w3: 'f_officer_cool',
  w4: 'f_juror_plain',
  w5: 'f_juror_hesitant',
  'J-01': 'f_juror_blunt',
  'J-02': 'f_juror_elder',
  'J-03': 'f_witness_soft',
  'J-04': 'f_witness_firm',
  'J-05': 'f_officer_cool',
  'J-06': 'f_counsel_sharp',
  'J-07': 'f_clerk_bright',
  'J-08': 'f_juror_plain',
  'J-09': 'f_juror_hesitant',
  'J-10': 'f_accused_strained',
  'J-11': 'f_juror_blunt',
}

const MALE_PREFERRED = {
  judge: JUDGE_VOICE_MALE,
  pc: 'm_counsel_steel',
  pros: 'm_counsel_steel',
  dc: 'm_counsel_steel',
  defc: 'm_counsel_steel',
  clerk: 'm_clerk_even',
  acc: 'm_accused_tense',
  w1: 'm_witness_gravel',
  w2: 'm_officer_flat',
  w3: 'm_juror_warm',
  w4: 'm_juror_blunt',
  w5: 'm_expert_clear',
  'J-01': 'm_juror_elder',
  'J-02': 'm_juror_young',
  'J-03': 'm_narrator_calm',
  'J-04': 'm_witness_gravel',
  'J-05': 'm_officer_flat',
  'J-06': 'm_juror_warm',
  'J-07': 'm_juror_blunt',
  'J-08': 'm_expert_clear',
  'J-09': 'm_clerk_even',
  'J-10': 'm_accused_tense',
  'J-11': 'm_juror_young',
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
