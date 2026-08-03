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
  const speechActive = useRef(false)
  const rangeEnded = useRef(false)
  const endedCallback = useRef(onEnded)
  endedCallback.current = onEnded

  const cancelSpeech = useCallback(() => {
    if (canSpeak()) window.speechSynthesis.cancel()
    speechActive.current = false
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

  useEffect(() => {
    failedAttempts.current = 0
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
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('error', handleError)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.pause()
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('pause', handlePause)
      cancelSpeech()
    }
  }, [audio, cancelSpeech, cue, speakFallback])

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
      if (document.visibilityState === 'hidden') {
        audio?.pause()
        if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
        if (speechActive.current && canSpeak()) {
          window.speechSynthesis.pause()
          setStatus('paused')
        }
      }
    }
    document.addEventListener('visibilitychange', interrupt)
    window.addEventListener('pagehide', interrupt)
    return () => {
      document.removeEventListener('visibilitychange', interrupt)
      window.removeEventListener('pagehide', interrupt)
    }
  }, [audio, cue.audio?.startSeconds])

  const play = useCallback(async () => {
    if (speechActive.current && canSpeak() && window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
      setStatus('speech-fallback')
      return
    }
    cancelSpeech()
    const source = audio ? supportedAudioSource(audio, cue) : null
    if (!audio || !source) {
      speakFallback()
      return
    }
    setStatus('loading')
    const start = cue.audio?.startSeconds ?? 0
    if (
      audio.currentTime < start ||
      (cue.audio?.endSeconds !== undefined && audio.currentTime >= cue.audio.endSeconds)
    ) {
      audio.currentTime = start
      rangeEnded.current = false
    }
    try {
      await audio.play()
    } catch {
      speakFallback()
    }
  }, [audio, cancelSpeech, cue, speakFallback])

  const pause = useCallback(() => {
    audio?.pause()
    if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
    if (speechActive.current && canSpeak()) window.speechSynthesis.pause()
    setStatus('paused')
  }, [audio, cue.audio?.startSeconds])

  const repeat = useCallback(async () => {
    cancelSpeech()
    rangeEnded.current = false
    if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
    await play()
  }, [audio, cancelSpeech, cue.audio?.startSeconds, play])

  return { status, error, play, pause, repeat }
}
