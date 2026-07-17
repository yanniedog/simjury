/** Neural narration with a same-origin, corpus-whitelisted Web Speech fallback. */
export interface VoiceParams {
  voiceIndex: number
  pitch: number
  rate: number
}

export const NARRATION_RATES = [0.85, 1, 1.15] as const
export type NarrationRate = (typeof NARRATION_RATES)[number]
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

/** Must stay byte-for-byte compatible with generate-narration-manifest.mjs. */
export function narrationIdFor(text: string, key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  return `${slug}-${hash(`${key}\0${text}`).toString(16).padStart(8, '0')}`
}

export function voiceParamsFor(key: string, voiceCount: number): VoiceParams {
  const h = hash(key)
  return {
    voiceIndex: voiceCount > 0 ? h % voiceCount : 0,
    pitch: key === 'narrator' ? 1 : 0.94 + (h % 13) / 100,
    rate: 0.94 + ((h >>> 3) % 8) / 100,
  }
}

/** Reserve a different available voice whenever the visible speaker changes. */
export function fallbackVoiceIndexes(keys: string[], voiceCount: number): number[] {
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

/** Prefer advertised neural/natural voices; locality is only a tie-break. */
export function voiceQualityScore(name: string, localService: boolean): number {
  const normalized = name.toLowerCase()
  let score = localService ? 1 : 0
  if (/natural|neural/.test(normalized)) score += 100
  if (/premium|enhanced/.test(normalized)) score += 80
  if (/google|microsoft/.test(normalized)) score += 10
  return score
}

const STORAGE_KEY = 'simjury:narration'
const RATE_STORAGE_KEY = 'simjury:narration-rate'

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

let voices: SpeechSynthesisVoice[] = []
function refreshVoices(): void {
  const s = synth()
  if (!s || typeof s.getVoices !== 'function') return
  const all = s.getVoices()
  const english = all.filter((v) => /^en/i.test(v.lang))
  voices = [...(english.length > 0 ? english : all)]
    .sort((a, b) => voiceQualityScore(b.name, b.localService) - voiceQualityScore(a.name, a.localService))
    .slice(0, 8)
}
{
  const s = synth()
  if (s) {
    refreshVoices()
    s.onvoiceschanged = refreshVoices
  }
}

export function narrationSupported(): boolean {
  return typeof Audio !== 'undefined' || synth() !== null
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
/** Active speakAll keys so fallback voice indexes use the voice list available at fallback time. */
let fallbackSequence: { keys: string[]; index: number } | null = null

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
  fallbackSequence = null
  cancelCurrent()
}

function speakFallback(
  text: string,
  key: string,
  myId: number,
  done: (() => void) | undefined,
  playbackRate: NarrationRate,
  onError: (() => void) | undefined,
): void {
  if (activeId !== myId) return
  const s = synth()
  if (!s) {
    onError?.()
    return
  }
  refreshVoices()
  const u = new SpeechSynthesisUtterance(text)
  const params = voiceParamsFor(key || 'narrator', voices.length)
  const index = fallbackSequence && voices.length > 0
    ? fallbackVoiceIndexes(fallbackSequence.keys, voices.length)[fallbackSequence.index]
    : params.voiceIndex
  if (voices.length > 0) u.voice = voices[index]
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

/** Play neural audio first; fall back to device speech if loading/playback fails. */
export function speak(
  text: string,
  key: string,
  done?: () => void,
  playbackRate: NarrationRate = narrationRate(),
  onError?: () => void,
): void {
  if (!narrationEnabled() || !text) {
    done?.()
    return
  }
  cancelCurrent()
  const myId = ++activeId
  if (typeof Audio === 'undefined') {
    speakFallback(text, key, myId, done, playbackRate, onError)
    return
  }

  let fellBack = false
  const fallback = () => {
    if (fellBack || activeId !== myId) return
    fellBack = true
    activeAudio = null
    speakFallback(text, key, myId, done, playbackRate, onError)
  }
  try {
    const audio = new Audio(`/api/narration/${narrationIdFor(text, key)}.mp3`)
    activeAudio = audio
    audio.preload = 'auto'
    audio.playbackRate = playbackRate
    // iOS Safari can ignore or reset playbackRate until playback starts.
    audio.onplay = () => {
      audio.playbackRate = playbackRate
    }
    audio.onended = () => {
      if (activeId === myId) {
        activeAudio = null
        done?.()
      }
    }
    audio.onerror = fallback
    void audio.play().catch(fallback)
  } catch {
    fallback()
  }
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
      fallbackSequence = null
      options.done?.()
      return
    }
    fallbackSequence = { keys, index: i }
    options.onLine?.(lines[i].key, i)
    speak(lines[i].text, lines[i].key, () => next(i + 1), options.rate, options.onError)
  }
  next(0)
}
