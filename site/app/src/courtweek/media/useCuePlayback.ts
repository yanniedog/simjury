import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  activeTurnId: string | null
  play: () => Promise<void>
  pause: () => void
  repeat: () => Promise<void>
}

export interface CuePlaybackOptions {
  /** Keep recorded media source-free until play() runs inside the user's gesture. */
  deferSourceUntilPlay?: boolean
  /** The next automatically presented cue, used to preserve a shared recorded segment. */
  followingCue?: SceneCue
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
const MAX_CONTINUOUS_SEGMENT_GAP_SECONDS = 0.75

interface ContinuousHandoff {
  fromCueId: string
  toCueId: string
  generation: number
  segmentId: string
  source: string
}

function speakerVoiceHash(speaker: string): number {
  let hash = 2166136261
  for (const character of speaker) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function availableSpeechVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak() || typeof window.speechSynthesis.getVoices !== 'function') return []
  const voices = window.speechSynthesis.getVoices()
  const australian = voices.filter((voice) => voice.lang.toLowerCase() === 'en-au')
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en-'))
  const pool = australian.length > 0 ? australian : english.length > 0 ? english : voices
  return [...pool].sort((left, right) =>
    `${left.lang}\u0000${left.name}`.localeCompare(`${right.lang}\u0000${right.name}`),
  )
}

function speechVoiceIdentity(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI || `${voice.lang}\u0000${voice.name}`
}

export function availableSpeechVoice(speaker: string): SpeechSynthesisVoice | null {
  const voices = availableSpeechVoices()
  return voices[speakerVoiceHash(speaker) % voices.length] ?? null
}

function assignDistinctSpeechVoices(speakers: string[]): Map<string, SpeechSynthesisVoice> | null {
  const identities = [...new Set(speakers)]
  const voices = availableSpeechVoices()
  if (voices.length < identities.length) return null
  const assigned = new Map<string, SpeechSynthesisVoice>()
  const used = new Set<string>()
  for (const speaker of identities) {
    const preferred = speakerVoiceHash(speaker) % voices.length
    let voice: SpeechSynthesisVoice | undefined
    for (let offset = 0; offset < voices.length; offset += 1) {
      const candidate = voices[(preferred + offset) % voices.length]
      if (!used.has(speechVoiceIdentity(candidate))) {
        voice = candidate
        break
      }
    }
    if (!voice) return null
    assigned.set(speaker, voice)
    used.add(speechVoiceIdentity(voice))
  }
  return assigned
}

export function useCuePlayback(
  cue: SceneCue,
  onEnded: () => void,
  nextSceneCue?: SceneCue,
  options: CuePlaybackOptions = {},
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
  const firstTurnId = cue.turns?.[0]?.id ?? null
  const [activeTurnState, setActiveTurnState] = useState({ cueId: cue.id, turnId: firstTurnId })
  const activeTurnId = activeTurnState.cueId === cue.id ? activeTurnState.turnId : firstTurnId
  const activeTurn = useRef<string | null>(activeTurnId)
  useLayoutEffect(() => { activeTurn.current = activeTurnId }, [activeTurnId])
  const failedAttempts = useRef(0)
  const failureHandling = useRef(false)
  const recordedAttemptActive = useRef(false)
  const playbackSuppressed = useRef(false)
  const reloadPauseExpected = useRef(false)
  const attemptGeneration = useRef(0)
  const recordedPlaybackGeneration = useRef<number | null>(null)
  const recordedCompletionHandlers = useRef<{
    audio: HTMLAudioElement
    ended: () => void
    timeupdate: () => void
  } | null>(null)
  const playbackTimeout = useRef<number | null>(null)
  const speechActive = useRef(false)
  const speechGeneration = useRef(0)
  const rangeEnded = useRef(false)
  const continuousHandoff = useRef<ContinuousHandoff | null>(null)
  const endedCallback = useRef(onEnded)
  endedCallback.current = onEnded

  const continuousFollowingCue = useMemo(() => {
    const followingCue = options.followingCue
    const segmentId = cue.audio?.segmentId
    const followingSegmentId = followingCue?.audio?.segmentId
    const end = cue.audio?.endSeconds
    const followingStart = followingCue?.audio?.startSeconds
    if (
      !audio
      || !followingCue
      || !segmentId
      || segmentId !== followingSegmentId
      || end === undefined
      || followingStart === undefined
      || followingStart < end
      || followingStart - end > MAX_CONTINUOUS_SEGMENT_GAP_SECONDS
    ) return null
    const source = supportedAudioSource(audio, cue)
    if (!source || supportedAudioSource(audio, followingCue) !== source) return null
    return { cue: followingCue, segmentId, source }
  }, [audio, cue, options.followingCue])

  const updateActiveTurn = useCallback((id: string | null) => {
    activeTurn.current = id
    setActiveTurnState((current) => current.cueId === cue.id && current.turnId === id
      ? current
      : { cueId: cue.id, turnId: id })
  }, [cue.id])

  const resumeBoundary = useCallback(() => (
    cue.audio?.turns?.find((turn) => turn.id === activeTurn.current)?.startSeconds
      ?? cue.audio?.startSeconds
      ?? 0
  ), [cue.audio?.startSeconds, cue.audio?.turns])

  const rewindToIncompleteTurn = useCallback(() => {
    if (!audio) return
    const timedTurn = cue.audio?.turns?.find(({ startSeconds, endSeconds }) =>
      audio.currentTime >= startSeconds && audio.currentTime < endSeconds)
    if (timedTurn && timedTurn.id !== activeTurn.current) updateActiveTurn(timedTurn.id)
    audio.currentTime = timedTurn?.startSeconds ?? resumeBoundary()
  }, [audio, cue.audio?.turns, resumeBoundary, updateActiveTurn])

  const cancelSpeech = useCallback(() => {
    speechGeneration.current += 1
    speechActive.current = false
    if (canSpeak()) window.speechSynthesis.cancel()
  }, [])

  const clearPlaybackTimeout = useCallback(() => {
    if (playbackTimeout.current !== null) window.clearTimeout(playbackTimeout.current)
    playbackTimeout.current = null
  }, [])

  const clearRecordedCompletionHandlers = useCallback(() => {
    const handlers = recordedCompletionHandlers.current
    if (!handlers) return
    handlers.audio.removeEventListener('ended', handlers.ended)
    handlers.audio.removeEventListener('timeupdate', handlers.timeupdate)
    recordedCompletionHandlers.current = null
  }, [])

  const finishRecordedPlayback = useCallback((generation: number): 'continued' | 'ended' | false => {
    if (
      generation !== attemptGeneration.current
      || generation !== recordedPlaybackGeneration.current
      || playbackSuppressed.current
      || rangeEnded.current
    ) return false
    rangeEnded.current = true
    if (continuousFollowingCue) {
      clearRecordedCompletionHandlers()
      continuousHandoff.current = {
        fromCueId: cue.id,
        toCueId: continuousFollowingCue.cue.id,
        generation,
        segmentId: continuousFollowingCue.segmentId,
        source: continuousFollowingCue.source,
      }
      endedCallback.current()
      return 'continued'
    }
    recordedPlaybackGeneration.current = null
    clearRecordedCompletionHandlers()
    setStatus('ended')
    endedCallback.current()
    return 'ended'
  }, [clearRecordedCompletionHandlers, continuousFollowingCue, cue.id])

  const bindRecordedCompletionHandlers = useCallback((generation: number) => {
    if (!audio) return
    clearRecordedCompletionHandlers()
    const handleEnded = () => {
      if (!audio.ended) return
      finishRecordedPlayback(generation)
    }
    const handleTimeUpdate = () => {
      if (
        generation !== attemptGeneration.current
        || generation !== recordedPlaybackGeneration.current
        || playbackSuppressed.current
      ) return
      const turn = cue.audio?.turns?.find(({ startSeconds, endSeconds }) =>
        audio.currentTime >= startSeconds && audio.currentTime < endSeconds)
      if (turn && turn.id !== activeTurn.current) updateActiveTurn(turn.id)
      const end = cue.audio?.endSeconds
      if (end !== undefined && audio.currentTime >= end) {
        if (finishRecordedPlayback(generation) === 'ended') audio.pause()
      }
    }
    const handlers = { audio, ended: handleEnded, timeupdate: handleTimeUpdate }
    recordedCompletionHandlers.current = handlers
    audio.addEventListener('ended', handlers.ended)
    audio.addEventListener('timeupdate', handlers.timeupdate)
  }, [audio, clearRecordedCompletionHandlers, cue.audio?.endSeconds, cue.audio?.turns, finishRecordedPlayback, updateActiveTurn])

  const suppressRecordedPlayback = useCallback(() => {
    playbackSuppressed.current = true
    reloadPauseExpected.current = false
    attemptGeneration.current += 1
    recordedPlaybackGeneration.current = null
    clearRecordedCompletionHandlers()
    recordedAttemptActive.current = false
    clearPlaybackTimeout()
  }, [clearPlaybackTimeout, clearRecordedCompletionHandlers])

  const speakFallback = useCallback(() => {
    if (speechActive.current) return
    const turns = cue.turns?.length
      ? cue.turns
      : [{ id: cue.id, speaker: cue.speaker, text: cue.text }]
    const voices = assignDistinctSpeechVoices(turns.map(({ speaker }) => speaker))
    if (!voices) {
      setStatus('reading-fallback')
      setError('Audio is unavailable. Reading mode is ready.')
      return
    }
    const currentIndex = Math.max(0, turns.findIndex((turn) => turn.id === activeTurn.current))
    const generation = ++speechGeneration.current
    speechActive.current = true
    setStatus('speech-fallback')
    const speakTurn = (index: number) => {
      const turn = turns[index]
      if (!turn || !speechActive.current || generation !== speechGeneration.current) return
      updateActiveTurn(turn.id)
      const utterance = new SpeechSynthesisUtterance(turn.text)
      utterance.lang = 'en-AU'
      utterance.rate = 0.96
      utterance.voice = voices.get(turn.speaker) ?? null
      utterance.onend = () => {
        if (!speechActive.current || generation !== speechGeneration.current) return
        if (index + 1 < turns.length) {
          speakTurn(index + 1)
          return
        }
        speechActive.current = false
        setStatus('ended')
        endedCallback.current()
      }
      utterance.onerror = () => {
        if (!speechActive.current || generation !== speechGeneration.current) return
        speechActive.current = false
        setStatus('reading-fallback')
        setError('Audio is unavailable. Reading mode is ready.')
      }
      window.speechSynthesis.speak(utterance)
    }
    speakTurn(currentIndex)
  }, [cue.id, cue.speaker, cue.text, cue.turns, updateActiveTurn])

  const attemptRecordedPlayback = useCallback(async (): Promise<'playing' | 'failed' | 'cancelled'> => {
    if (!audio || recordedAttemptActive.current) return 'cancelled'
    recordedAttemptActive.current = true
    const generation = ++attemptGeneration.current
    recordedPlaybackGeneration.current = generation
    bindRecordedCompletionHandlers(generation)
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
  }, [audio, bindRecordedCompletionHandlers, clearPlaybackTimeout])

  const recoverRecordedPlayback = useCallback(async () => {
    if (failureHandling.current || playbackSuppressed.current || speechActive.current) return
    failureHandling.current = true
    attemptGeneration.current += 1
    recordedPlaybackGeneration.current = null
    clearRecordedCompletionHandlers()
    recordedAttemptActive.current = false
    clearPlaybackTimeout()
    try {
      if (audio?.src && failedAttempts.current < 1) {
        failedAttempts.current += 1
        reloadPauseExpected.current = true
        audio.load()
        const retryResult = await attemptRecordedPlayback()
        if (retryResult !== 'failed') return
        if (playbackSuppressed.current) return
      }
      reloadPauseExpected.current = true
      audio?.pause()
      playbackSuppressed.current = false
      setError('Recorded audio could not be loaded. Using this device instead.')
      speakFallback()
    } finally {
      failureHandling.current = false
    }
  }, [attemptRecordedPlayback, audio, clearPlaybackTimeout, clearRecordedCompletionHandlers, speakFallback])

  useEffect(() => {
    const source = audio ? supportedAudioSource(audio, cue) : null
    const pendingHandoff = continuousHandoff.current
    const continuingRecordedSegment = Boolean(
      audio
      && source
      && pendingHandoff
      && pendingHandoff.toCueId === cue.id
      && pendingHandoff.segmentId === cue.audio?.segmentId
      && pendingHandoff.source === source
      && pendingHandoff.generation === recordedPlaybackGeneration.current
      && !playbackSuppressed.current,
    )

    if (continuingRecordedSegment) {
      continuousHandoff.current = null
      rangeEnded.current = false
      updateActiveTurn(cue.turns?.[0]?.id ?? null)
      setError(null)
    } else {
      continuousHandoff.current = null
      failedAttempts.current = 0
      failureHandling.current = false
      recordedAttemptActive.current = false
      playbackSuppressed.current = false
      reloadPauseExpected.current = false
      attemptGeneration.current += 1
      recordedPlaybackGeneration.current = null
      clearRecordedCompletionHandlers()
      clearPlaybackTimeout()
      rangeEnded.current = false
      updateActiveTurn(cue.turns?.[0]?.id ?? null)
      setStatus('idle')
      setError(null)
      cancelSpeech()
      if (!audio) return
      audio.pause()
      audio.currentTime = cue.audio?.startSeconds ?? 0
      audio.preload = options.deferSourceUntilPlay ? 'none' : 'metadata'
      if (source && !options.deferSourceUntilPlay) audio.src = source
      else audio.removeAttribute('src')
    }

    if (!audio) return

    const handleLoadedMetadata = () => {
      const start = cue.audio?.startSeconds ?? 0
      if (audio.currentTime < start || (cue.audio?.endSeconds !== undefined && audio.currentTime >= cue.audio.endSeconds)) {
        audio.currentTime = start
      }
    }
    const handleError = () => { void recoverRecordedPlayback() }
    const handlePlaying = () => {
      const generation = recordedPlaybackGeneration.current
      if (
        generation === null
        || generation !== attemptGeneration.current
        || playbackSuppressed.current
      ) {
        suppressRecordedPlayback()
        audio.pause()
        if (!rangeEnded.current) {
          rewindToIncompleteTurn()
          setStatus('paused')
        }
        return
      }
      reloadPauseExpected.current = false
      clearPlaybackTimeout()
      setStatus('playing')
    }
    const handlePause = () => {
      if (!audio.ended && !rangeEnded.current) {
        if (reloadPauseExpected.current) {
          reloadPauseExpected.current = false
          return
        }
        if (!playbackSuppressed.current) suppressRecordedPlayback()
        rewindToIncompleteTurn()
        setStatus('paused')
      }
    }
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('error', handleError)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('pause', handlePause)
    if (continuingRecordedSegment && recordedPlaybackGeneration.current !== null) {
      bindRecordedCompletionHandlers(recordedPlaybackGeneration.current)
    }
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('pause', handlePause)
      const handoff = continuousHandoff.current
      const preservePlayback = Boolean(
        handoff
        && handoff.fromCueId === cue.id
        && handoff.generation === recordedPlaybackGeneration.current
        && !playbackSuppressed.current,
      )
      if (preservePlayback) {
        queueMicrotask(() => {
          if (continuousHandoff.current !== handoff) return
          continuousHandoff.current = null
          suppressRecordedPlayback()
          audio.pause()
          cancelSpeech()
        })
        return
      }
      suppressRecordedPlayback()
      // Some browsers and deterministic test doubles dispatch `pause`
      // synchronously. Detach this cue's listeners first so teardown cannot
      // update playback state while React is committing the next cue.
      audio.pause()
      cancelSpeech()
    }
  }, [audio, bindRecordedCompletionHandlers, cancelSpeech, clearPlaybackTimeout, clearRecordedCompletionHandlers, cue, options.deferSourceUntilPlay, recoverRecordedPlayback, rewindToIncompleteTurn, suppressRecordedPlayback, updateActiveTurn])

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
      suppressRecordedPlayback()
      audio?.pause()
      rewindToIncompleteTurn()
      if (speechActive.current) cancelSpeech()
      setStatus('paused')
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
  }, [audio, cancelSpeech, rewindToIncompleteTurn, suppressRecordedPlayback])

  const play = useCallback(async () => {
    if (recordedAttemptActive.current || failureHandling.current) return
    if (recordedPlaybackGeneration.current !== null && !playbackSuppressed.current) return
    playbackSuppressed.current = false
    reloadPauseExpected.current = false
    cancelSpeech()
    const source = audio ? supportedAudioSource(audio, cue) : null
    if (!audio || !source) {
      speakFallback()
      return
    }
    if (audio.src !== source) {
      audio.preload = 'metadata'
      audio.src = source
    }
    const start = cue.audio?.startSeconds ?? 0
    if (
      audio.currentTime < start ||
      (cue.audio?.endSeconds !== undefined && audio.currentTime >= cue.audio.endSeconds)
    ) {
      audio.currentTime = start
      rangeEnded.current = false
      updateActiveTurn(cue.turns?.[0]?.id ?? null)
    }
    if (await attemptRecordedPlayback() === 'failed') await recoverRecordedPlayback()
  }, [attemptRecordedPlayback, audio, cancelSpeech, cue, recoverRecordedPlayback, speakFallback, updateActiveTurn])

  const pause = useCallback(() => {
    suppressRecordedPlayback()
    audio?.pause()
    rewindToIncompleteTurn()
    if (speechActive.current) cancelSpeech()
    setStatus('paused')
  }, [audio, cancelSpeech, rewindToIncompleteTurn, suppressRecordedPlayback])

  const repeat = useCallback(async () => {
    cancelSpeech()
    rangeEnded.current = false
    if (audio) audio.currentTime = cue.audio?.startSeconds ?? 0
    updateActiveTurn(cue.turns?.[0]?.id ?? null)
    await play()
  }, [audio, cancelSpeech, cue.audio?.startSeconds, cue.turns, play, updateActiveTurn])

  return { status, error, activeTurnId, play, pause, repeat }
}
