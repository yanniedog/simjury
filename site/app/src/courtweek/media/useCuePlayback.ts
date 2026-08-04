import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SceneCue } from '../model/schema'

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'speech-fallback'
  | 'reading-fallback'
  | 'ended'

export interface CuePlayback {
  status: PlaybackStatus
  error: string | null
  play: () => Promise<void>
  pause: () => void
  repeat: () => Promise<void>
}

export function supportedAudioSource(
  audio: Pick<HTMLAudioElement, 'canPlayType'>,
  cue: SceneCue,
): string | null {
  if (!cue.audio) return null
  if (cue.audio.opus && audio.canPlayType('audio/ogg; codecs="opus"')) {
    return cue.audio.opus
  }
  if (cue.audio.aac && audio.canPlayType('audio/mp4; codecs="mp4a.40.2"')) {
    return cue.audio.aac
  }
  return cue.audio.mp3 ?? cue.audio.aac ?? cue.audio.opus ?? null
}

function canSpeak(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

const RECORDED_AUDIO_TIMEOUT_MS = 5_000

function availableSpeechVoice(): SpeechSynthesisVoice | null {
  if (!canSpeak() || typeof window.speechSynthesis.getVoices !== 'function') return null
  const voices = window.speechSynthesis.getVoices()
  return voices.find((voice) => voice.lang.toLowerCase() === 'en-au')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en-'))
    ?? voices[0]
    ?? null
}

export function useCuePlayback(
  cue: SceneCue,
  onEnded: () => void,
  nextSceneCue?: SceneCue,
): CuePlayback {
  const audio = useMemo(
    () => (typeof Audio === 'undefined' ? null : new Audio()),
    [],
  )
  const preloader = useMemo(
    () => (typeof Audio === 'undefined' ? null : new Audio()),
    [],
  )
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const failedAttempts = useRef(0)
  const failureHandling = useRef(false)
  const recordedAttemptActive = useRef(false)
  const playbackSuppressed = useRef(false)
  const attemptGeneration = useRef(0)
  const playbackTimeout = useRef<number | null>(null)
  const speechActive = useRef(false)
  const rangeEnded = useRef(false)
  const endedCallback = useRef(onEnded)
  endedCallback.current = onEnded

  const cancelSpeech = useCallback(() => {
    if (canSpeak()) window.speechSynthesis.cancel()
    speechActive.current = false
  }, [])

  const clearPlaybackTimeout = useCallback(() => {
    if (playbackTimeout.current !== null) window.clearTimeout(playbackTimeout.current)
    playbackTimeout.current = null
  }, [])

  const speakFallback = useCallback(() => {
    if (speechActive.current) return
    const voice = availableSpeechVoice()
    if (!voice) {
      setStatus('reading-fallback')
      setError('Audio is unavailable. Reading mode is ready.')
      return
    }
    const utterance = new SpeechSynthesisUtterance(cue.text)
    utterance.lang = 'en-AU'
    utterance.rate = 0.96
    utterance.voice = voice
    utterance.onend = () => {
      speechActive.current = false
      setStatus('ended')
      endedCallback.current()
    }
    utterance.onerror = () => {
      speechActive.current = false
      setStatus('reading-fallback')
      setError('Audio is unavailable. Reading mode is ready.')
    }
    speechActive.current = true
    setStatus('speech-fallback')
    window.speechSynthesis.speak(utterance)
  }, [cue.text])

  const attemptRecordedPlayback = useCallback(async (): Promise<'playing' | 'failed' | 'cancelled'> => {
    if (!audio || recordedAttemptActive.current) return 'cancelled'
    recordedAttemptActive.current = true
    const generation = ++attemptGeneration.current
    clearPlaybackTimeout()
    setStatus('loading')
    try {
      await Promise.race([
        audio.play(),
        new Promise<never>((_, reject) => {
          playbackTimeout.current = window.setTimeout(
            () => reject(new Error('Recorded audio timed out.')),
            RECORDED_AUDIO_TIMEOUT_MS,
          )
        }),
      ])
      return generation === attemptGeneration.current ? 'playing' : 'cancelled'
    } catch {
      return generation === attemptGeneration.current ? 'failed' : 'cancelled'
    } finally {
      if (generation === attemptGeneration.current) {
        recordedAttemptActive.current = false
        clearPlaybackTimeout()
      }
    }
  }, [audio, clearPlaybackTimeout])

  const recoverRecordedPlayback = useCallback(async () => {
    if (failureHandling.current || playbackSuppressed.current || speechActive.current) return
    failureHandling.current = true
    attemptGeneration.current += 1
    recordedAttemptActive.current = false
    clearPlaybackTimeout()
    try {
      if (audio?.src && failedAttempts.current < 1) {
        failedAttempts.current += 1
        audio.load()
        const retryResult = await attemptRecordedPlayback()
        if (retryResult !== 'failed') return
        if (playbackSuppressed.current) return
      }
      audio?.pause()
      playbackSuppressed.current = false
      setError('Recorded audio could not be loaded. Using this device instead.')
      speakFallback()
    } finally {
      failureHandling.current = false
    }
  }, [attemptRecordedPlayback, audio, clearPlaybackTimeout, speakFallback])

  useEffect(() => {
    failedAttempts.current = 0
    failureHandling.current = false
    recordedAttemptActive.current = false
    playbackSuppressed.current = false
    attemptGeneration.current += 1
    clearPlaybackTimeout()
    rangeEnded.current = false
    setStatus('idle')
    setError(null)
    cancelSpeech()
    if (!audio) return
    audio.pause()
    audio.currentTime = cue.audio?.startSeconds ?? 0
    audio.preload = 'metadata'
    const source = supportedAudioSource(audio, cue)
    if (source) audio.src = source
    else audio.removeAttribute('src')

    const finishRange = () => {
      if (rangeEnded.current) return
      rangeEnded.current = true
      setStatus('ended')
      endedCallback.current()
    }
    const handleEnded = () => finishRange()
    const handleLoadedMetadata = () => {
      const start = cue.audio?.startSeconds ?? 0
      if (audio.currentTime < start || (cue.audio?.endSeconds !== undefined && audio.currentTime >= cue.audio.endSeconds)) {
        audio.currentTime = start
      }
    }
    const handleTimeUpdate = () => {
      const end = cue.audio?.endSeconds
      if (end !== undefined && audio.currentTime >= end) {
        audio.pause()
        finishRange()
      }
    }
    const handleError = () => { void recoverRecordedPlayback() }
    const handlePlaying = () => {
      clearPlaybackTimeout()
      setStatus('playing')
    }
    const handlePause = () => {
      if (!audio.ended && !rangeEnded.current) {
        playbackSuppressed.current = true
        attemptGeneration.current += 1
        recordedAttemptActive.current = false
        clearPlaybackTimeout()
        audio.currentTime = cue.audio?.startSeconds ?? 0
        setStatus('paused')
      }
    }
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('error', handleError)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.pause()
      attemptGeneration.current += 1
      recordedAttemptActive.current = false
      playbackSuppressed.current = true
      clearPlaybackTimeout()
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('pause', handlePause)
      cancelSpeech()
    }
  }, [audio, cancelSpeech, clearPlaybackTimeout, cue, recoverRecordedPlayback])

  useEffect(() => {
    if (!preloader) return
    preloader.pause()
    const source = nextSceneCue ? supportedAudioSource(preloader, nextSceneCue) : null
    if (!source) {
      preloader.removeAttribute('src')
      return
    }
    preloader.preload = 'metadata'
    preloader.src = source
    return () => {
      preloader.pause()
      preloader.removeAttribute('src')
    }
  }, [nextSceneCue, preloader])

  useEffect(() => {
    const interrupt = () => {
      audio?.pause()
      if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
      if (speechActive.current && canSpeak()) {
        window.speechSynthesis.cancel()
        speechActive.current = false
        setStatus('paused')
      }
    }
    const interruptWhenHidden = () => {
      if (document.visibilityState === 'hidden') interrupt()
    }
    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    document.addEventListener('visibilitychange', interruptWhenHidden)
    window.addEventListener('pagehide', interrupt)
    mediaDevices?.addEventListener('devicechange', interrupt)
    return () => {
      document.removeEventListener('visibilitychange', interruptWhenHidden)
      window.removeEventListener('pagehide', interrupt)
      mediaDevices?.removeEventListener('devicechange', interrupt)
    }
  }, [audio, cue.audio?.startSeconds])

  const play = useCallback(async () => {
    if (recordedAttemptActive.current || failureHandling.current) return
    playbackSuppressed.current = false
    cancelSpeech()
    const source = audio ? supportedAudioSource(audio, cue) : null
    if (!audio || !source) {
      speakFallback()
      return
    }
    const start = cue.audio?.startSeconds ?? 0
    if (
      audio.currentTime < start ||
      (cue.audio?.endSeconds !== undefined && audio.currentTime >= cue.audio.endSeconds)
    ) {
      audio.currentTime = start
      rangeEnded.current = false
    }
    if (await attemptRecordedPlayback() === 'failed') await recoverRecordedPlayback()
  }, [attemptRecordedPlayback, audio, cancelSpeech, cue, recoverRecordedPlayback, speakFallback])

  const pause = useCallback(() => {
    audio?.pause()
    if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
    if (speechActive.current) cancelSpeech()
    setStatus('paused')
  }, [audio, cancelSpeech, cue.audio?.startSeconds])

  const repeat = useCallback(async () => {
    cancelSpeech()
    rangeEnded.current = false
    if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
    await play()
  }, [audio, cancelSpeech, cue.audio?.startSeconds, play])

  return { status, error, play, pause, repeat }
}
