import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CourtSession, Scene, SceneCue } from '../model/schema'
import type { PlaybackStatus } from '../media/useCuePlayback'
import type { AccessMode } from '../state/progress'
import {
  captionPlacementStyle,
  captionViewportForSize,
  evaluateCaptionRuntimeFit,
  responsiveCaptionPlacements,
  type CaptionFitFailure,
  type CaptionRect,
} from './captionPlacement'

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

function legacyAssetUrl(base: string, id: string, composition: string, format: string) {
  return `${base}/${id}-${composition}.${format}`
}

function sceneAssetUrl(
  base: string,
  scene: Scene,
  composition: 'portrait' | 'tablet' | 'desktop',
  format: 'avif' | 'webp',
) {
  const runtimeStrip = scene.visual.runtimeStrip?.sources?.[composition]?.[format]
  if (runtimeStrip) return runtimeStrip
  const commissioned = scene.visual.sources?.[composition]?.[format]
  return commissioned
    ? `${base}/${commissioned}`
    : legacyAssetUrl(base, scene.visual.fallbackId, composition, format)
}

function captionRect(rect: DOMRect): CaptionRect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

interface CaptionRuntimeState {
  mode: 'off' | 'fit' | 'reading'
  reason: CaptionFitFailure | null
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
  const captionOverlay = useRef<HTMLDivElement>(null)
  const captionCopy = useRef<HTMLSpanElement>(null)
  const controls = useRef<HTMLElement>(null)
  const speakerCollisionProbe = useRef<HTMLParagraphElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenSupported = typeof document !== 'undefined'
    && typeof document.documentElement.requestFullscreen === 'function'
  const [imageAvailable, setImageAvailable] = useState(true)
  const [captionRuntime, setCaptionRuntime] = useState<CaptionRuntimeState>({ mode: 'off', reason: null })

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    update()
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  useEffect(() => setImageAvailable(true), [scene.id])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (stage.current?.requestFullscreen) await stage.current.requestFullscreen()
    } catch {
      setFullscreen(Boolean(document.fullscreenElement))
    }
  }

  const playing = playbackStatus === 'playing' || playbackStatus === 'speech-fallback'
  const captionOverlayRequested = playbackStatus !== 'reading-fallback' && accessMode !== 'reading' && (
    accessMode === 'captions' ||
    playbackStatus === 'speech-fallback'
  )
  const stripFocalX = scene.visual.runtimeStrip
    ? (scene.visual.runtimeStrip.cell * 100 + scene.visual.focalPoint.x) / 2
    : scene.visual.focalPoint.x
  const focalStyle = {
    objectPosition: `${stripFocalX}% ${scene.visual.focalPoint.y}%`,
  }
  const visualUrl = (
    composition: 'portrait' | 'tablet' | 'desktop',
    format: 'avif' | 'webp',
  ) => sceneAssetUrl(releaseBase, scene, composition, format)
  const captionPlacements = useMemo(() => responsiveCaptionPlacements(scene.visual), [scene.visual])
  const captionsNeedReading = captionOverlayRequested && captionRuntime.mode === 'reading'
  const readingModeActive = accessMode === 'reading' || playbackStatus === 'reading-fallback' || captionsNeedReading

  useLayoutEffect(() => {
    if (!captionOverlayRequested) {
      setCaptionRuntime({ mode: 'off', reason: null })
      return
    }
    let cancelled = false
    let frame = 0
    const measure = () => {
      if (cancelled) return
      const stageNode = stage.current
      const overlayNode = captionOverlay.current
      const copyNode = captionCopy.current
      const controlsNode = controls.current
      const speakerNode = speakerCollisionProbe.current
      if (!stageNode || !overlayNode || !copyNode || !controlsNode || !speakerNode) {
        setCaptionRuntime({ mode: 'reading', reason: 'layout-unavailable' })
        return
      }
      const stageBox = stageNode.getBoundingClientRect()
      const viewport = captionViewportForSize(stageBox.width, stageBox.height)
      const fit = evaluateCaptionRuntimeFit({
        placementFits: captionPlacements[viewport].fits,
        overlay: captionRect(copyNode.getBoundingClientRect()),
        controls: captionRect(controlsNode.getBoundingClientRect()),
        speaker: captionRect(speakerNode.getBoundingClientRect()),
        clientHeight: copyNode.clientHeight,
        scrollHeight: copyNode.scrollHeight,
      })
      setCaptionRuntime({ mode: fit.fits ? 'fit' : 'reading', reason: fit.reason })
    }
    const schedule = () => {
      if (cancelled) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(measure)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (const node of [stage.current, controls.current, captionCopy.current, speakerCollisionProbe.current]) {
      if (node) observer?.observe(node)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    void document.fonts?.ready.then(schedule)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
    }
  }, [captionOverlayRequested, captionPlacements, cue.id, cue.text])

  return (
    <main
      ref={stage}
      className={`cw-shell cw-tone--${cue.tone}`}
      data-caption-phone-position={captionPlacements.phonePortrait.position}
      data-caption-landscape-position={captionPlacements.phoneLandscape.position}
      data-caption-tablet-position={captionPlacements.tablet.position}
      data-caption-desktop-position={captionPlacements.desktop.position}
      data-caption-phone-fits={captionPlacements.phonePortrait.fits}
      data-caption-landscape-fits={captionPlacements.phoneLandscape.fits}
      data-caption-tablet-fits={captionPlacements.tablet.fits}
      data-caption-desktop-fits={captionPlacements.desktop.fits}
      data-permitted-caption-positions={scene.visual.permittedCaptionPositions?.join(' ') ?? scene.visual.captionPosition}
      data-subject-safe-region={scene.visual.subjectSafeRegion
        ? JSON.stringify(scene.visual.subjectSafeRegion)
        : undefined}
      data-evidence-safe-region={scene.visual.evidenceSafeRegion
        ? JSON.stringify(scene.visual.evidenceSafeRegion)
        : undefined}
      data-access-mode={accessMode}
      data-complete-captions={readingModeActive}
      data-caption-runtime-state={captionRuntime.mode}
      data-caption-runtime-reason={captionRuntime.reason ?? undefined}
      data-media-notice={Boolean(playbackError)}
      style={captionPlacementStyle(captionPlacements)}
    >
      <a className="cw-skip-link" href="#cw-primary-controls">Skip to controls</a>

      <div className="cw-stage" aria-busy={playbackStatus === 'loading'}>
        <picture
          className={`cw-stage__picture${scene.visual.runtimeStrip ? ' cw-stage__picture--strip' : ''}${imageAvailable ? '' : ' cw-stage__picture--unavailable'}`}
          data-strip-cell={scene.visual.runtimeStrip?.cell}
        >
          <source
            media="(orientation: portrait) and (max-width: 700px)"
            type="image/avif"
            srcSet={visualUrl('portrait', 'avif')}
          />
          <source
            media="(orientation: portrait) and (max-width: 700px)"
            type="image/webp"
            srcSet={visualUrl('portrait', 'webp')}
          />
          <source
            media="(orientation: landscape) and (max-height: 500px), (min-width: 1100px)"
            type="image/avif"
            srcSet={visualUrl('desktop', 'avif')}
          />
          <source
            media="(orientation: landscape) and (max-height: 500px), (min-width: 1100px)"
            type="image/webp"
            srcSet={visualUrl('desktop', 'webp')}
          />
          <source type="image/avif" srcSet={visualUrl('tablet', 'avif')} />
          <source type="image/webp" srcSet={visualUrl('tablet', 'webp')} />
          <img
            src={visualUrl('tablet', 'webp')}
            srcSet={visualUrl('tablet', 'webp')}
            sizes="100vw"
            alt={imageAvailable ? scene.visual.alt : ''}
            style={focalStyle}
            onError={() => setImageAvailable(false)}
            onLoad={() => setImageAvailable(true)}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </picture>
        {!imageAvailable ? (
          <div
            className="cw-stage__fallback"
            role="img"
            aria-label="Courtroom image unavailable; proceedings continue."
          />
        ) : null}

        <header className="cw-status" aria-label="Court session status">
          <p><span>{session.day}</span><span aria-hidden="true"> · </span>{scene.phase.replace('-', ' ')}</p>
          <p>{progressLabel}</p>
        </header>

        <section className="cw-speaker" aria-labelledby="cw-speaker-name">
          <p id="cw-speaker-name">
            {cue.speaker}
            {cue.tone === 'cross' ? <span className="cw-speaker__mode"> · cross-examination</span> : null}
          </p>
          {readingModeActive ? <p className="cw-reading-copy">{cue.text}</p> : null}
        </section>

        <div className="cw-speaker cw-speaker--collision-probe" aria-hidden="true">
          <p ref={speakerCollisionProbe}>
            {cue.speaker}
            {cue.tone === 'cross' ? <span className="cw-speaker__mode"> · cross-examination</span> : null}
          </p>
        </div>

        {captionOverlayRequested ? (
          <div ref={captionOverlay} className="cw-captions" aria-hidden="true">
            <span ref={captionCopy}>{cue.text}</span>
          </div>
        ) : null}

        <p
          className="cw-visually-hidden"
          aria-live={readingModeActive ? 'off' : 'polite'}
          aria-hidden={readingModeActive || undefined}
          aria-atomic="true"
        >
          {cue.speaker}: {cue.accessibleProposition}
        </p>

        {playbackError ? <p className="cw-media-notice" role="status">{playbackError}</p> : null}

        <nav ref={controls} id="cw-primary-controls" className="cw-controls" aria-label="Court playback controls">
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
          {fullscreenSupported ? (
            <button type="button" onClick={() => void toggleFullscreen()} aria-pressed={fullscreen}>
              {fullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          ) : null}
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
