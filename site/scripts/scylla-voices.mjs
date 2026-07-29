/**
 * Scylla's Band voice assignment for CI jobs.
 * Must stay aligned with site/app/src/lib/narrationAltVoice.ts.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genderForCastMember, genderForJuror, hash } from './speaker-voices.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ALT = JSON.parse(readFileSync(join(here, '../app/src/lib/narrationAltVoice.json'), 'utf8'))

export const NARRATOR_VOICE = ALT.narrator
export const JUDGE_VOICE_MALE = ALT.judgeMale
export const JUDGE_VOICE_FEMALE = ALT.judgeFemale
export const FEMALE_VOICES = ALT.female
export const MALE_VOICES = ALT.male
export const FEMALE_PREFERRED = ALT.femalePreferred
export const MALE_PREFERRED = ALT.malePreferred
export const LANGUAGES = ALT.languages

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

export function assignScyllaVoices(docket) {
  const voices = new Map()
  const genders = new Map()
  const used = new Set()

  voices.set('narrator', NARRATOR_VOICE)
  genders.set('narrator', 'female')
  used.add(NARRATOR_VOICE)

  const cast = [...(docket.cast ?? [])].sort((a, b) => a.id.localeCompare(b.id))
  const jurors = [...(docket.jury?.jurors ?? [])].sort((a, b) => a.id.localeCompare(b.id))
  const ordered = [
    ...cast.filter((m) => m.id === 'judge'),
    ...cast.filter((m) => m.id !== 'judge'),
    ...jurors,
  ]

  for (const member of ordered) {
    const id = member.id
    const gender = Object.prototype.hasOwnProperty.call(member, 'persona')
      ? genderForJuror(member.persona, id, member.gender)
      : genderForCastMember(member)
    genders.set(id, gender)
    const preferred = preferredVoice(id, gender)
    if (id === 'judge') {
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

export function languageForVoice(voiceId) {
  return LANGUAGES[voiceId] ?? 'en_us'
}
