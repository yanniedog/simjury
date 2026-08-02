export type CourtroomAmbiencePhase =
  | 'intro'
  | 'openings'
  | 'beats'
  | 'closings'
  | 'juryroom'
  | 'reveal'

const STORAGE_KEY = 'simjury:ambience'

export const AMBIENCE_PROFILES: Record<
  CourtroomAmbiencePhase,
  { volume: number; toneHz: number; noiseHz: number }
> = {
  intro: { volume: 0.012, toneHz: 64, noiseHz: 520 },
  openings: { volume: 0.016, toneHz: 70, noiseHz: 640 },
  beats: { volume: 0.014, toneHz: 67, noiseHz: 580 },
  closings: { volume: 0.018, toneHz: 73, noiseHz: 680 },
  juryroom: { volume: 0.01, toneHz: 58, noiseHz: 430 },
  reveal: { volume: 0.008, toneHz: 54, noiseHz: 360 },
}

let memoryEnabled = false
let phase: CourtroomAmbiencePhase = 'intro'
let context: AudioContext | null = null
let master: GainNode | null = null
let tone: OscillatorNode | null = null
let filter: BiquadFilterNode | null = null

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  return window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
}

export function courtroomAmbienceSupported(): boolean {
  return audioContextConstructor() !== null
}

export function courtroomAmbienceEnabled(): boolean {
  if (!courtroomAmbienceSupported()) return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? memoryEnabled : stored === 'on'
  } catch {
    return memoryEnabled
  }
}

function applyProfile(): void {
  if (!context || !master || !tone || !filter) return
  const profile = AMBIENCE_PROFILES[phase]
  const at = context.currentTime
  master.gain.cancelScheduledValues(at)
  master.gain.setTargetAtTime(profile.volume, at, 0.8)
  tone.frequency.setTargetAtTime(profile.toneHz, at, 0.8)
  filter.frequency.setTargetAtTime(profile.noiseHz, at, 0.8)
}

function createNoiseBuffer(audioContext: AudioContext): AudioBuffer {
  const frames = audioContext.sampleRate * 2
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate)
  const channel = buffer.getChannelData(0)
  let last = 0
  for (let index = 0; index < frames; index += 1) {
    const white = Math.random() * 2 - 1
    last = last * 0.96 + white * 0.04
    channel[index] = last
  }
  return buffer
}

function start(): void {
  if (!courtroomAmbienceEnabled()) return
  if (context) {
    void context.resume()
    applyProfile()
    return
  }
  const Constructor = audioContextConstructor()
  if (!Constructor) return
  context = new Constructor()
  master = context.createGain()
  master.gain.value = 0
  master.connect(context.destination)

  filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.35
  filter.connect(master)

  const noise = context.createBufferSource()
  noise.buffer = createNoiseBuffer(context)
  noise.loop = true
  noise.connect(filter)
  noise.start()

  tone = context.createOscillator()
  tone.type = 'sine'
  const toneGain = context.createGain()
  toneGain.gain.value = 0.08
  tone.connect(toneGain).connect(master)
  tone.start()
  applyProfile()
  void context.resume()
}

export function setCourtroomAmbiencePhase(
  next: CourtroomAmbiencePhase,
): void {
  phase = next
  start()
}

export function stopCourtroomAmbience(): void {
  const active = context
  context = null
  master = null
  tone = null
  filter = null
  if (active) void active.close()
}

export function setCourtroomAmbienceEnabled(
  enabled: boolean,
  currentPhase: CourtroomAmbiencePhase = phase,
): boolean {
  memoryEnabled = enabled
  phase = currentPhase
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // The in-memory preference still works when browser storage is blocked.
  }
  if (enabled) start()
  else stopCourtroomAmbience()
  return enabled
}
