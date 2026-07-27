/**
 * Gender-aware voice planning for Daily Docket narration.
 * Voice assignment mirrors site/scripts/speaker-voices.mjs so browser
 * URLs match CI-generated assets; device fallback stays gender-matched and
 * as distinct as the local inventory allows.
 */
import castGenders from './castGenders.json'
import voiceBank from './narrationVoices.json'

export type SpeakerGender = 'female' | 'male'

/** Highest-grade Kokoro female narrator — reserved. */
export const NARRATOR_VOICE = 'af_heart'
/** British male gravitas for male judges. */
export const JUDGE_VOICE_MALE = 'bm_george'
/** Warm British female for female judges. */
export const JUDGE_VOICE_FEMALE = 'bf_emma'

const FEMALE_VOICES = voiceBank.female
  .map((v) => v.id)
  .filter((id) => id !== NARRATOR_VOICE && id !== JUDGE_VOICE_FEMALE)

const MALE_VOICES = voiceBank.male
  .map((v) => v.id)
  .filter((id) => id !== JUDGE_VOICE_MALE)

const FEMALE_PREFERRED: Record<string, string> = {
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

const MALE_PREFERRED: Record<string, string> = {
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

export type SpeakerVoicePlan = {
  genderByKey: Map<string, SpeakerGender>
  /** Synthesis voice id per speaker — must match site/scripts/speaker-voices.mjs. */
  kokoroByKey: Map<string, string>
  keys: string[]
}

function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** Infer juror gender from persona self-reference; else stable mix by id. */
export function genderForJuror(persona: string, id: string): SpeakerGender {
  const text = persona ?? ''
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

export function genderForCastName(name: string, id = ''): SpeakerGender {
  const named = (castGenders as Record<string, SpeakerGender>)[name]
  if (named === 'female' || named === 'male') return named
  return hash(id || name) % 2 === 0 ? 'female' : 'male'
}

function preferredVoice(speakerId: string, gender: SpeakerGender): string {
  if (speakerId === 'narrator') return NARRATOR_VOICE
  const fixed = gender === 'female' ? FEMALE_PREFERRED[speakerId] : MALE_PREFERRED[speakerId]
  if (fixed) return fixed
  const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES
  return pool[hash(`${speakerId}\0${gender}`) % pool.length]
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

/** Classify a local SpeechSynthesis voice by name heuristics. */
export function deviceVoiceGender(name: string): SpeakerGender | 'unknown' {
  const n = name.toLowerCase()
  if (/\bfemale\b|\bwoman\b/.test(n)) return 'female'
  if (/\bmale\b|\bman\b/.test(n)) return 'male'
  if (
    /\b(zira|hazel|samantha|karen|moira|tessa|fiona|veena|raveena|susan|catherine|serena|vicki|kendra|kimberly|salli|ivy|joanna|amy|emma|bella|allison|ava|jenny|aria|sonia|heather|linda|michelle)\b/.test(
      n,
    )
  ) {
    return 'female'
  }
  if (
    /\b(david|mark|daniel|thomas|fred|bruce|brian|matthew|justin|joey|richard|george|oliver|ravi|james|john|alex|guy|ryan|tony|nathan|eric|arthur|aaron)\b/.test(
      n,
    )
  ) {
    return 'male'
  }
  return 'unknown'
}

/**
 * Build a case voice plan from cast + jurors. Mirrors scripts/speaker-voices.mjs
 * so natural-clip URLs resolve to the CI-generated assets.
 */
export function buildSpeakerVoicePlan(input: {
  cast: Array<{ id: string; name: string }>
  jurors?: Array<{ id: string; persona: string }>
}): SpeakerVoicePlan {
  const genderByKey = new Map<string, SpeakerGender>()
  const kokoroByKey = new Map<string, string>()
  const used = new Set<string>()

  genderByKey.set('narrator', 'female')
  kokoroByKey.set('narrator', NARRATOR_VOICE)
  used.add(NARRATOR_VOICE)

  for (const member of input.cast) {
    genderByKey.set(member.id, genderForCastName(member.name, member.id))
  }
  for (const juror of input.jurors ?? []) {
    genderByKey.set(juror.id, genderForJuror(juror.persona, juror.id))
  }

  const keys = ['narrator', ...[...genderByKey.keys()].filter((k) => k !== 'narrator').sort()]
  const ordered = [
    ...keys.filter((k) => k === 'judge'),
    ...keys.filter((k) => k !== 'judge' && k !== 'narrator'),
  ]

  for (const id of ordered) {
    const gender = genderByKey.get(id) ?? 'female'
    const preferred = preferredVoice(id, gender)
    if (id === 'judge') {
      kokoroByKey.set(id, preferred)
      used.add(preferred)
      continue
    }
    const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES
    const voice = pickUnique(pool, used, preferred, id)
    kokoroByKey.set(id, voice)
    used.add(voice)
  }

  return { genderByKey, kokoroByKey, keys }
}

/**
 * Assign each distinct speaker a local voice index.
 * Prefer gender-matched voices; keep the same speaker on the same index;
 * avoid reusing an index for a different speaker while unused voices remain.
 */
export function assignDeviceVoiceIndexes(
  plan: SpeakerVoicePlan,
  voices: Array<{ name: string }>,
): Map<string, number> {
  const result = new Map<string, number>()
  if (voices.length === 0) return result

  const femaleIdx: number[] = []
  const maleIdx: number[] = []
  const unknownIdx: number[] = []
  voices.forEach((voice, index) => {
    const g = deviceVoiceGender(voice.name)
    if (g === 'female') femaleIdx.push(index)
    else if (g === 'male') maleIdx.push(index)
    else unknownIdx.push(index)
  })

  const used = new Set<number>()
  const pick = (gender: SpeakerGender, key: string): number => {
    const preferred =
      gender === 'female'
        ? [...femaleIdx, ...unknownIdx, ...maleIdx]
        : [...maleIdx, ...unknownIdx, ...femaleIdx]
    const pool = preferred.length > 0 ? preferred : voices.map((_, i) => i)
    const start = hash(key) % pool.length
    for (let i = 0; i < pool.length; i++) {
      const index = pool[(start + i) % pool.length]
      if (!used.has(index)) {
        used.add(index)
        return index
      }
    }
    return pool[start]
  }

  const ordered = [
    ...plan.keys.filter((k) => k === 'judge'),
    ...plan.keys.filter((k) => k !== 'judge'),
  ]
  for (const key of ordered) {
    const gender = plan.genderByKey.get(key) ?? 'female'
    if (key === 'judge') {
      const pool = gender === 'female' ? femaleIdx : maleIdx
      const gravitas = pool.find((i) => !used.has(i)) ?? pool[0]
      if (gravitas !== undefined) {
        used.add(gravitas)
        result.set(key, gravitas)
        continue
      }
    }
    result.set(key, pick(gender, key))
  }
  return result
}

/** Pitch/rate bands: judge slower and lower for gravitas; others stay distinct. */
export function voiceParamsForGender(
  key: string,
  gender: SpeakerGender,
): { pitch: number; rate: number } {
  if (key === 'narrator') return { pitch: 1, rate: 1 }
  if (key === 'judge') {
    return {
      pitch: gender === 'male' ? 0.82 : 0.88,
      rate: 0.88,
    }
  }
  const h = hash(key)
  const pitchBase = gender === 'female' ? 1.02 : 0.9
  return {
    pitch: pitchBase + (h % 9) / 100,
    rate: 0.94 + ((h >>> 3) % 8) / 100,
  }
}
