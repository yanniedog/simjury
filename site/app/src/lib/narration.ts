/**
 * Browser narration engine — the "listenable, like a podcast" layer
 * (site/DECISIONS.md D-WEB-1), extracted from the /play player as a
 * framework-agnostic module. Uses the free Web Speech API: fully client-side,
 * $0, no audio assets. Each speaker key maps deterministically to a voice,
 * pitch, and rate so a character sounds consistent for a given device.
 * Safe to import in tests and SSR: everything degrades to a no-op when
 * speechSynthesis is unavailable.
 */

export interface VoiceParams {
  voiceIndex: number
  pitch: number
  rate: number
}

/** Deterministic voice parameters per speaker key (pure; unit-tested). */
export function voiceParamsFor(key: string, voiceCount: number): VoiceParams {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return {
    voiceIndex: voiceCount > 0 ? h % voiceCount : 0,
    pitch: key === 'narrator' ? 1 : 0.94 + (h % 13) / 100,
    rate: 0.94 + ((h >> 3) % 8) / 100,
  }
}

/** Prefer human-quality voices, using local availability as a modest tie-break. */
export function voiceQualityScore(name: string, localService: boolean): number {
  const normalized = name.toLowerCase()
  let score = localService ? 1 : 0
  if (/natural|neural/.test(normalized)) score += 10
  if (/premium|enhanced/.test(normalized)) score += 8
  if (/google|microsoft/.test(normalized)) score += 3
  return score
}

const STORAGE_KEY = 'simjury:narration'

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

let voices: SpeechSynthesisVoice[] = []
function refreshVoices(): void {
  const s = synth()
  if (!s) return
  const all = s.getVoices()
  const english = all.filter((v) => /^en/i.test(v.lang))
  const candidates = english.length > 0 ? english : all
  const ranked = [...candidates].sort(
    (a, b) => voiceQualityScore(b.name, b.localService) - voiceQualityScore(a.name, a.localService),
  )
  const natural = ranked.filter((voice) => voiceQualityScore(voice.name, voice.localService) >= 8)
  voices = natural.length >= 2 ? natural : ranked.slice(0, 8)
}
{
  const s = synth()
  if (s) {
    refreshVoices()
    s.onvoiceschanged = refreshVoices
  }
}

export function narrationSupported(): boolean {
  return synth() !== null
}

// In-memory fallback for the on/off preference. Sandboxed/privacy contexts
// can throw on every localStorage access; without this, narrationEnabled()
// would default to false and setNarrationEnabled(true) could never
// override it, silencing narration for the whole session even though
// speechSynthesis itself is available.
let memoryEnabled = false

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
    // Storage can be blocked; the toggle won't persist across reloads, but
    // the in-memory override above still takes effect for this session.
  }
  if (!on) stopSpeech()
}

// A transaction id (not a callback reference) tracks the active utterance:
// two speak() calls can legitimately share the same `done` reference (e.g. a
// caller re-using one callback across lines), so comparing by identity to
// the callback itself would let a late, cancelled utterance's onend/onerror
// match a newer call and fire or clear state it doesn't own.
let activeId = 0

export function stopSpeech(): void {
  const s = synth()
  if (s) {
    activeId++
    s.cancel()
  }
}

/**
 * Speak [text] as [key]; call [done] when it finishes naturally. On a genuine
 * speech error the engine stops without calling [done], so a failing voice
 * can never auto-advance the player through content unheard.
 */
export function speak(text: string, key: string, done?: () => void): void {
  const s = synth()
  if (!s || !narrationEnabled() || !text) {
    if (done) done()
    return
  }
  s.cancel()
  const myId = ++activeId
  const u = new SpeechSynthesisUtterance(text)
  const params = voiceParamsFor(key || 'narrator', voices.length)
  if (voices.length > 0) u.voice = voices[params.voiceIndex]
  u.pitch = params.pitch
  u.rate = params.rate
  u.onend = () => {
    if (activeId === myId && done) done()
  }
  u.onerror = () => {
    // No-op: do not call done on error, so a failing voice never
    // auto-advances the player past content it never heard.
  }
  s.speak(u)
}

/** Speak a sequence of lines in order, chaining on natural completion. */
export function speakAll(
  lines: Array<{ text: string; key: string }>,
  done?: () => void,
): void {
  if (!narrationEnabled()) {
    if (done) done()
    return
  }
  const next = (i: number): void => {
    if (i >= lines.length) {
      if (done) done()
      return
    }
    speak(lines[i].text, lines[i].key, () => next(i + 1))
  }
  next(0)
}
