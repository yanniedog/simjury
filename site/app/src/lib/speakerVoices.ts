/**
 * Gender-aware voice planning for Daily Docket narration.
 * Voice assignment mirrors site/scripts/speaker-voices.mjs so browser
 * URLs match CI-generated assets; device fallback stays gender-matched and
 * as distinct as the local inventory allows.
 */
import castGenders from './castGenders.json'
import voiceBank from './narrationVoices.json'

export type SpeakerGender = 'female' | 'male'

export const NARRATOR_VOICE = 'f_narrator_clear'
export const JUDGE_VOICE_MALE = 'm_baritone_judge'
export const JUDGE_VOICE_FEMALE = 'f_counsel_warm'

const FEMALE_VOICES = voiceBank.female
  .map((v) => v.id)
  .filter((id) => id !== NARRATOR_VOICE)

const MALE_VOICES = voiceBank.male
  .map((v) => v.id)
  .filter((id) => id !== JUDGE_VOICE_MALE)

const FEMALE_PREFERRED: Record<string, string> = {
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

const MALE_PREFERRED: Record<string, string> = {
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
