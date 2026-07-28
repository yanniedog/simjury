/** Open-source narration clips from GitHub Releases, with device-local speech fallback. */
import {
  ALT_VOICE_ENGINE_ID,
  ALT_VOICE_RELEASE_PREFIX,
  altVoiceModeAvailable,
  buildAltVoiceByKey,
  normaliseNarrationEngine,
  type NarrationEngineId,
} from './narrationAltVoice'
import {
  assignDeviceVoiceIndexes,
  buildSpeakerVoicePlan,
  type SpeakerVoicePlan,
  voiceParamsForGender,
  type SpeakerGender,
} from './speakerVoices'

export interface VoiceParams {
  voiceIndex: number
  pitch: number
  rate: number
}

export const NARRATION_RATES = [0.85, 1, 1.15] as const
export type NarrationRate = (typeof NARRATION_RATES)[number]
export const NARRATION_SHARDS = 32
export type { NarrationEngineId }
type SpokenLine = { text: string; key: string }

export function normaliseNarrationRate(value: unknown): NarrationRate {
  const parsed = typeof value === 'number' ? value : Number(value)
  return NARRATION_RATES.find((rate) => rate === parsed) ?? 1
}

function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function voiceForEngine(
  key: string,
  gender: SpeakerGender,
  engine: NarrationEngineId,
  voice?: string,
): string {
  if (voice) return voice
  if (engine === ALT_VOICE_ENGINE_ID) {
    return altVoiceByKey.get(key) ?? (gender === 'female' ? 'ariadne' : 'orpheus')
  }
  return activePlan?.kokoroByKey.get(key) ?? (gender === 'female' ? 'af_bella' : 'bm_lewis')
}

export function narrationIdFor(
  text: string,
  key: string,
  gender?: SpeakerGender,
  voice?: string,
  engine: NarrationEngineId = narrationEngine(),
): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const g = gender ?? genderForKey(key)
  const v = voiceForEngine(key, g, engine, voice)
  // Kokoro ids stay byte-stable; only experimental engines fold into the hash.
  const material =
    engine === 'kokoro'
      ? key === 'narrator'
        ? `${key}\0${text}`
        : `${key}\0${g}\0${v}\0${text}`
      : key === 'narrator'
        ? `${key}\0${engine}\0${text}`
        : `${key}\0${engine}\0${g}\0${v}\0${text}`
  return `${slug}-${hash(material).toString(16).padStart(8, '0')}`
}

export function naturalVoiceUrlFor(
  text: string,
  key: string,
  gender?: SpeakerGender,
  voice?: string,
  engine: NarrationEngineId = narrationEngine(),
): string {
  const id = narrationIdFor(text, key, gender, voice, engine)
  const shard = Number.parseInt(id.slice(-8, -6), 16) % NARRATION_SHARDS
  const prefix = engine === ALT_VOICE_ENGINE_ID ? ALT_VOICE_RELEASE_PREFIX : 'narration-kokoro'
  return `https://github.com/yanniedog/simjury/releases/download/${prefix}-${shard}/${id}.mp3`
}

let activePlan: SpeakerVoicePlan | null = null
let altVoiceByKey: Map<string, string> = new Map()
let plannedIndexes: Map<string, number> = new Map()

/** Register cast/juror genders for the active sitting so fallback voices stay matched. */
export function setNarrationSpeakers(input: {
  cast: Array<{ id: string; name: string }>
  jurors?: Array<{ id: string; persona: string }>
}): void {
  activePlan = buildSpeakerVoicePlan(input)
  altVoiceByKey = altVoiceModeAvailable()
    ? buildAltVoiceByKey({ genderByKey: activePlan.genderByKey, keys: activePlan.keys })
    : new Map()
  rebuildPlannedIndexes()
}

export function clearNarrationSpeakers(): void {
  activePlan = null
  altVoiceByKey = new Map()
  plannedIndexes = new Map()
}

function genderForKey(key: string): SpeakerGender {
  return activePlan?.genderByKey.get(key) ?? (key === 'narrator' ? 'female' : hash(key) % 2 === 0 ? 'female' : 'male')
}

export function voiceParamsFor(key: string, voiceCount: number): VoiceParams {
  const gender = genderForKey(key)
  const { pitch, rate } = voiceParamsForGender(key, gender)
  const planned = plannedIndexes.get(key)
  return {
    voiceIndex: planned ?? (voiceCount > 0 ? hash(key) % voiceCount : 0),
    pitch,
    rate,
  }
}

/**
 * Reserve a different available voice whenever the visible speaker changes.
 * When a case plan is active, indexes come from gender-aware unique assignment.
 */
export function fallbackVoiceIndexes(keys: string[], voiceCount: number): number[] {
  if (activePlan && voiceCount > 0) {
    // Prefer the live module voice list when its length matches the caller's count.
    const list = voices.length === voiceCount ? voices : Array.from({ length: voiceCount }, (_, i) => ({ name: `Voice ${i}` }))
    const assigned = assignDeviceVoiceIndexes(activePlan, list)
    plannedIndexes = assigned
    return keys.map((key) => assigned.get(key) ?? hash(key) % voiceCount)
  }
  const indexes: number[] = []
  for (const [i, key] of keys.entries()) {
    let index = voiceParamsFor(key, voiceCount).voiceIndex
    if (i > 0 && key === keys[i - 1]) {
      index = indexes[i - 1]
    } else if (voiceCount > 1 && i > 0 && index === indexes[i - 1]) {
      index = (index + 1) % voiceCount
    }
    indexes.push(index)
  }
  return indexes
}

/** Rank voices only after remote synthesis services have been excluded. */
export function voiceQualityScore(name: string, localService: boolean): number {
  const normalized = name.toLowerCase()
  let score = localService ? 1 : 0
  if (/natural|neural/.test(normalized)) score += 100
  if (/premium|enhanced/.test(normalized)) score += 80
  if (/google|microsoft/.test(normalized)) score += 10
  return score
}

export function selectLocalVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const local = all.filter((voice) => voice.localService)
  const english = local.filter((voice) => /^en/i.test(voice.lang))
  // Keep a wide English local pool so each courtroom speaker can stay distinct.
  return [...(english.length > 0 ? english : local)].sort(
    (a, b) => voiceQualityScore(b.name, true) - voiceQualityScore(a.name, true),
  )
}

const STORAGE_KEY = 'simjury:narration'
const RATE_STORAGE_KEY = 'simjury:narration-rate'
const ENGINE_STORAGE_KEY = 'simjury:narration-engine'

let memoryEngine: NarrationEngineId = 'kokoro'

export function narrationEngine(): NarrationEngineId {
  if (!altVoiceModeAvailable()) return 'kokoro'
  try {
    return normaliseNarrationEngine(localStorage.getItem(ENGINE_STORAGE_KEY) ?? memoryEngine)
  } catch {
    return normaliseNarrationEngine(memoryEngine)
  }
}

export function setNarrationEngine(value: unknown): NarrationEngineId {
  memoryEngine = normaliseNarrationEngine(value)
  try {
    localStorage.setItem(ENGINE_STORAGE_KEY, memoryEngine)
  } catch {
    // Session memory still applies when storage is blocked.
  }
  stopSpeech()
  return memoryEngine
}

export {
  ALT_VOICE_LABEL,
  DEFAULT_VOICE_LABEL,
  altVoiceModeAvailable,
  normaliseNarrationEngine,
} from './narrationAltVoice'

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

let voices: SpeechSynthesisVoice[] = []

function rebuildPlannedIndexes(): void {
  if (activePlan && voices.length > 0) {
    plannedIndexes = assignDeviceVoiceIndexes(activePlan, voices)
  }
}

function refreshVoices(): void {
  const s = synth()
  if (!s || typeof s.getVoices !== 'function') return
  voices = selectLocalVoices(s.getVoices())
  rebuildPlannedIndexes()
}
{
  const s = synth()
  if (s) {
    refreshVoices()
    s.onvoiceschanged = refreshVoices
  }
}

export function narrationSupported(): boolean {
  refreshVoices()
  return typeof Audio !== 'undefined' || (synth() !== null && voices.length > 0)
}

let memoryEnabled = false
let memoryRate: NarrationRate = 1

export function narrationEnabled(): boolean {
  if (!narrationSupported()) return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? memoryEnabled : stored === 'on'
  } catch {
    return memoryEnabled
  }
}

export function setNarrationEnabled(on: boolean): void {
  memoryEnabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // The in-memory setting still works when storage is blocked.
  }
  if (!on) stopSpeech()
}

export function narrationRate(): NarrationRate {
  try {
    const stored = localStorage.getItem(RATE_STORAGE_KEY)
    return stored === null ? memoryRate : normaliseNarrationRate(stored)
  } catch {
    return memoryRate
  }
}

export function setNarrationRate(value: unknown): NarrationRate {
  memoryRate = normaliseNarrationRate(value)
  try {
    localStorage.setItem(RATE_STORAGE_KEY, String(memoryRate))
  } catch {
    // Keep the selected rate for this session.
  }
  stopSpeech()
  return memoryRate
}

let activeId = 0
let activeAudio: HTMLAudioElement | null = null

type FallbackSequence = { keys: string[]; index: number }

function cancelCurrent(): void {
  if (activeAudio) {
    activeAudio.onended = null
    activeAudio.onerror = null
    activeAudio.onplay = null
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
    activeAudio = null
  }
  synth()?.cancel()
}

export function stopSpeech(): void {
  activeId++
  cancelCurrent()
}

function speakFallback(
  text: string,
  key: string,
  myId: number,
  done: (() => void) | undefined,
  playbackRate: NarrationRate,
  onError: (() => void) | undefined,
  sequence: FallbackSequence | null,
): void {
  if (activeId !== myId) return
  const s = synth()
  if (!s) {
    onError?.()
    return
  }
  refreshVoices()
  if (voices.length === 0) {
    onError?.()
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  const params = voiceParamsFor(key || 'narrator', voices.length)
  // Compute indexes at fallback time so async voice loading is reflected.
  const index = sequence && voices.length > 0
    ? fallbackVoiceIndexes(sequence.keys, voices.length)[sequence.index]
    : params.voiceIndex
  u.voice = voices[index]
  u.pitch = params.pitch
  u.rate = params.rate * playbackRate
  u.onend = () => {
    if (activeId === myId) done?.()
  }
  // Do not call done on error — a failing voice must not auto-advance unheard lines.
  u.onerror = () => {
    if (activeId === myId) onError?.()
  }
  try {
    s.speak(u)
  } catch {
    if (activeId === myId) onError?.()
  }
}

/** Play an opaque-id release clip; fall back to Kokoro then device speech if needed. */
export function speak(
  text: string,
  key: string,
  done?: () => void,
  playbackRate: NarrationRate = narrationRate(),
  onError?: () => void,
  sequence: FallbackSequence | null = null,
): void {
  if (!narrationEnabled() || !text) {
    done?.()
    return
  }
  cancelCurrent()
  const myId = ++activeId
  if (typeof Audio === 'undefined') {
    speakFallback(text, key, myId, done, playbackRate, onError, sequence)
    return
  }

  const engine = narrationEngine()
  const urls = [naturalVoiceUrlFor(text, key, undefined, undefined, engine)]
  // Experimental clips may lag; try Standard Kokoro before device speech.
  if (engine === ALT_VOICE_ENGINE_ID) {
    urls.push(naturalVoiceUrlFor(text, key, undefined, undefined, 'kokoro'))
  }

  let urlIndex = 0
  const playNext = () => {
    if (activeId !== myId) return
    if (urlIndex >= urls.length) {
      activeAudio = null
      speakFallback(text, key, myId, done, playbackRate, onError, sequence)
      return
    }
    try {
      const audio = new Audio(urls[urlIndex++])
      activeAudio = audio
      audio.preload = 'auto'
      audio.playbackRate = playbackRate
      audio.onplay = () => {
        audio.playbackRate = playbackRate
      }
      audio.onended = () => {
        if (activeId === myId) {
          activeAudio = null
          done?.()
        }
      }
      audio.onerror = playNext
      void audio.play().catch(playNext)
    } catch {
      playNext()
    }
  }
  playNext()
}

export function speakAll(
  lines: SpokenLine[],
  options: {
    done?: () => void
    onLine?: (key: string, index: number) => void
    onError?: () => void
    rate?: NarrationRate
  } = {},
): void {
  if (!narrationEnabled()) {
    options.done?.()
    return
  }
  const keys = lines.map((line) => line.key)
  const next = (i: number): void => {
    if (i >= lines.length) {
      options.done?.()
      return
    }
    options.onLine?.(lines[i].key, i)
    speak(lines[i].text, lines[i].key, () => next(i + 1), options.rate, options.onError, { keys, index: i })
  }
  next(0)
}
