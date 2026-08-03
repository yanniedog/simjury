import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CourtSession, Scene, SceneCue } from '../model/schema'
import { ImmersiveCourtShell } from './ImmersiveCourtShell'

const cue: SceneCue = {
  id: 'cue-1',
  event: 'witness-cross',
  speaker: 'Defence counsel',
  text: 'The READY display did not certify mechanical readiness, did it?',
  accessibleProposition: 'Counsel challenges whether READY proved mechanical readiness.',
  tone: 'cross',
  evidenceIds: [],
  replayable: false,
}
const scene: Scene = {
  id: 'scene-1',
  title: 'Cross-examination',
  phase: 'crown-case',
  visual: {
    fallbackId: 'defence-cross',
    alt: 'Defence counsel addresses the witness from the jury viewpoint.',
    focalPoint: { x: 58, y: 42 },
    captionPosition: 'bottom',
  },
  cues: [cue],
  transitionSeconds: 3,
}
const session: CourtSession = {
  id: 'monday',
  ordinal: 1,
  day: 'Monday',
  title: 'The call',
  unlockAt: '2026-08-10T08:30:00+10:00',
  targetMinutes: 20,
  prerequisiteSessionIds: [],
  scenes: [scene, scene, scene],
}

describe('ImmersiveCourtShell', () => {
  it('delivers responsive art, nonduplicated live copy and complete controls', () => {
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session}
        scene={scene}
        cue={cue}
        releaseBase="https://example.test/assets"
        accessMode="captions"
        playbackStatus="paused"
        playbackError={null}
        progressLabel="Scene 1 of 3"
        deskOpen={false}
        onPlay={() => undefined}
        onPause={() => undefined}
        onRepeat={() => undefined}
        onAdvance={() => undefined}
        onToggleCaptions={() => undefined}
        onToggleDesk={() => undefined}
      />,
    )

    expect(markup).toContain('media="(max-width: 599px) and (orientation: portrait)"')
    expect(markup).toContain('defence-cross-portrait.avif')
    expect(markup).toContain('defence-cross-tablet.webp')
    expect(markup).toContain('defence-cross-desktop.avif')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Juror desk')
    expect(markup).toContain('Full screen')
    expect(markup).toContain('cross-examination')
    expect(markup).toContain('aria-live="polite"')
  })

  it('keeps full dialogue visible in reading mode without live-region duplication', () => {
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session}
        scene={scene}
        cue={cue}
        releaseBase="/media"
        accessMode="reading"
        playbackStatus="reading-fallback"
        playbackError="Audio is unavailable. Reading mode is ready."
        progressLabel="Scene 1 of 3"
        deskOpen={false}
        onPlay={() => undefined}
        onPause={() => undefined}
        onRepeat={() => undefined}
        onAdvance={() => undefined}
        onToggleCaptions={() => undefined}
        onToggleDesk={() => undefined}
      />,
    )

    expect(markup).toContain('cw-reading-copy')
    expect(markup).toContain('aria-live="off"')
    expect(markup).toContain('Continue')
  })
})
