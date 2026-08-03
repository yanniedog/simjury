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

function supportedAudioSource(
  audio: HTMLAudioElement,
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

export function useCuePlayback(
  cue: SceneCue,
  onEnded: () => void,
): CuePlayback {
  const audio = useMemo(
    () => (typeof Audio === 'undefined' ? null : new Audio()),
    [],
  )
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const failedAttempts = useRef(0)
  const endedCallback = useRef(onEnded)
  endedCallback.current = onEnded

  const cancelSpeech = useCallback(() => {
    if (canSpeak()) window.speechSynthesis.cancel()
  }, [])

  const speakFallback = useCallback(() => {
    if (!canSpeak()) {
      setStatus('reading-fallback')
      setError('Audio is unavailable. Reading mode is ready.')
      return
    }
    const utterance = new SpeechSynthesisUtterance(cue.text)
    utterance.lang = 'en-AU'
    utterance.rate = 0.96
    utterance.onend = () => {
      setStatus('ended')
      endedCallback.current()
    }
    utterance.onerror = () => {
      setStatus('reading-fallback')
      setError('Audio is unavailable. Reading mode is ready.')
    }
    setStatus('speech-fallback')
    window.speechSynthesis.speak(utterance)
  }, [cue.text])

  useEffect(() => {
    failedAttempts.current = 0
    setStatus('idle')
    setError(null)
    cancelSpeech()
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    audio.preload = 'metadata'
    const source = supportedAudioSource(audio, cue)
    if (source) audio.src = source
    else audio.removeAttribute('src')

    const handleEnded = () => {
      setStatus('ended')
      endedCallback.current()
    }
    const handleError = () => {
      if (failedAttempts.current < 1 && audio.src) {
        failedAttempts.current += 1
        audio.load()
        void audio.play().catch(speakFallback)
        return
      }
      setError('Recorded audio could not be loaded. Using this device instead.')
      speakFallback()
    }
    const handlePlaying = () => setStatus('playing')
    const handlePause = () => {
      if (!audio.ended) setStatus('paused')
    }
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.pause()
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('pause', handlePause)
      cancelSpeech()
    }
  }, [audio, cancelSpeech, cue, speakFallback])

  useEffect(() => {
    const interrupt = () => {
      if (document.visibilityState === 'hidden') {
        audio?.pause()
        if (canSpeak()) window.speechSynthesis.pause()
      }
    }
    document.addEventListener('visibilitychange', interrupt)
    window.addEventListener('pagehide', interrupt)
    return () => {
      document.removeEventListener('visibilitychange', interrupt)
      window.removeEventListener('pagehide', interrupt)
    }
  }, [audio])

  const play = useCallback(async () => {
    cancelSpeech()
    const source = audio ? supportedAudioSource(audio, cue) : null
    if (!audio || !source) {
      speakFallback()
      return
    }
    setStatus('loading')
    try {
      await audio.play()
    } catch {
      speakFallback()
    }
  }, [audio, cancelSpeech, cue, speakFallback])

  const pause = useCallback(() => {
    audio?.pause()
    if (canSpeak()) window.speechSynthesis.pause()
    setStatus('paused')
  }, [audio])

  const repeat = useCallback(async () => {
    cancelSpeech()
    if (audio) audio.currentTime = 0
    await play()
  }, [audio, cancelSpeech, play])

  return { status, error, play, pause, repeat }
}
