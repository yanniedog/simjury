import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CourtSession, Scene, SceneCue } from '../model/schema'
import type { PlaybackStatus } from '../media/useCuePlayback'
import type { AccessMode } from '../state/progress'

export type { AccessMode } from '../state/progress'

export interface ImmersiveCourtShellProps {
  session: CourtSession
  scene: Scene
  cue: SceneCue
  releaseBase: string
  accessMode: AccessMode
  playbackStatus: PlaybackStatus
  playbackError: string | null
  progressLabel: string
  deskOpen: boolean
  overlay?: ReactNode
  onPlay: () => void
  onPause: () => void
  onRepeat: () => void
  onAdvance: () => void
  onToggleCaptions: () => void
  onToggleDesk: () => void
}

function assetUrl(base: string, id: string, composition: string, format: string) {
  return `${base}/${id}-${composition}.${format}`
}

function sharedAssetUrl(base: string, composition: string, format: string) {
  const suffix = composition === 'desktop' ? 'wide' : composition
  return `${base}/courtroom-${suffix}.${format}`
}

export function ImmersiveCourtShell({
  session,
  scene,
  cue,
  releaseBase,
  accessMode,
  playbackStatus,
  playbackError,
  progressLabel,
  deskOpen,
  overlay,
  onPlay,
  onPause,
  onRepeat,
  onAdvance,
  onToggleCaptions,
  onToggleDesk,
}: ImmersiveCourtShellProps) {
  const stage = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [imageFallback, setImageFallback] = useState<'scene' | 'shared' | 'none'>('scene')

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stage.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  useEffect(() => setImageFallback('scene'), [scene.visual.fallbackId])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen()
    } catch {
      setFullscreen(false)
    }
  }

  const playing = playbackStatus === 'playing' || playbackStatus === 'speech-fallback'
  const captionsVisible =
    accessMode === 'captions' ||
    playbackStatus === 'speech-fallback' ||
    playbackStatus === 'reading-fallback'
  const captionsNeedReading = captionsVisible && cue.text.length > 110
  const focalStyle = {
    objectPosition: `${scene.visual.focalPoint.x}% ${scene.visual.focalPoint.y}%`,
  }
  const visualUrl = (composition: string, format: string) =>
    imageFallback === 'shared'
      ? sharedAssetUrl(releaseBase, composition, format)
      : assetUrl(releaseBase, scene.visual.fallbackId, composition, format)

  return (
    <main
      ref={stage}
      className={`cw-shell cw-tone--${cue.tone}`}
      data-caption-position={scene.visual.captionPosition}
      data-access-mode={accessMode}
      data-complete-captions={captionsNeedReading}
    >
      <a className="cw-skip-link" href="#cw-primary-controls">Skip to controls</a>

      <div className="cw-stage" aria-busy={playbackStatus === 'loading'}>
        {imageFallback !== 'none' ? (
          <picture className="cw-stage__picture">
            <source
              media="(max-width: 599px) and (orientation: portrait)"
              type="image/avif"
              srcSet={visualUrl('portrait', 'avif')}
            />
            <source
              media="(max-width: 599px) and (orientation: portrait)"
              type="image/webp"
              srcSet={visualUrl('portrait', 'webp')}
            />
            <source
              media="(min-width: 600px) and (max-width: 1099px)"
              type="image/avif"
              srcSet={visualUrl('tablet', 'avif')}
            />
            <source
              media="(min-width: 600px) and (max-width: 1099px)"
              type="image/webp"
              srcSet={visualUrl('tablet', 'webp')}
            />
            <source
              media="(min-width: 1100px)"
              type="image/avif"
              srcSet={visualUrl('desktop', 'avif')}
            />
            <source
              media="(min-width: 1100px)"
              type="image/webp"
              srcSet={visualUrl('desktop', 'webp')}
            />
            <img
              src={visualUrl('desktop', 'webp')}
              alt={scene.visual.alt}
              style={focalStyle}
              onError={() => setImageFallback((current) => current === 'scene' ? 'shared' : 'none')}
              decoding="async"
            />
          </picture>
        ) : (
          <div className="cw-stage__fallback" role="img" aria-label={scene.visual.alt} />
        )}

        <header className="cw-status" aria-label="Court session status">
          <p><span>{session.day}</span><span aria-hidden="true"> · </span>{scene.phase.replace('-', ' ')}</p>
          <p>{progressLabel}</p>
        </header>

        <section className="cw-speaker" aria-labelledby="cw-speaker-name">
          <p id="cw-speaker-name">
            {cue.speaker}
            {cue.tone === 'cross' ? <span className="cw-speaker__mode"> · cross-examination</span> : null}
          </p>
          {(accessMode === 'reading' || captionsNeedReading) ? <p className="cw-reading-copy">{cue.text}</p> : null}
        </section>

        {captionsVisible && !captionsNeedReading ? (
          <div className="cw-captions" aria-hidden="true">
            <span>{cue.text}</span>
          </div>
        ) : null}

        <p
          className="cw-visually-hidden"
          aria-live={accessMode === 'reading' ? 'off' : 'polite'}
          aria-atomic="true"
        >
          {cue.speaker}: {cue.accessibleProposition}
        </p>

        {playbackError ? <p className="cw-media-notice" role="status">{playbackError}</p> : null}

        <nav id="cw-primary-controls" className="cw-controls" aria-label="Court playback controls">
          <button type="button" onClick={playing ? onPause : onPlay}>
            {playing ? 'Pause' : playbackStatus === 'paused' ? 'Resume' : 'Play'}
          </button>
          <button type="button" onClick={onRepeat}>Repeat</button>
          <button
            type="button"
            onClick={onToggleCaptions}
            aria-pressed={accessMode === 'captions'}
          >
            Captions
          </button>
          <button type="button" onClick={onToggleDesk} aria-expanded={deskOpen}>
            Juror desk
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-pressed={fullscreen}>
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          {(accessMode === 'reading' || playbackStatus === 'reading-fallback') ? (
            <button type="button" className="cw-controls__advance" onClick={onAdvance}>
              Continue
            </button>
          ) : null}
        </nav>
      </div>
      {overlay}
    </main>
  )
}
