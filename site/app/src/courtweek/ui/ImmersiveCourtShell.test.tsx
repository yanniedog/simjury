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
    subjectSafeRegion: { x: 12, y: 18, width: 76, height: 58 },
    evidenceSafeRegion: { x: 30, y: 28, width: 40, height: 30 },
    permittedCaptionPositions: ['bottom'],
    sources: {
      portrait: { avif: 'scenes/scene-1/portrait.avif', webp: 'scenes/scene-1/portrait.webp' },
      tablet: { avif: 'scenes/scene-1/tablet.avif', webp: 'scenes/scene-1/tablet.webp' },
      desktop: { avif: 'scenes/scene-1/desktop.avif', webp: 'scenes/scene-1/desktop.webp' },
    },
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
const stripScene: Scene = {
  ...scene,
  visual: {
    ...scene.visual,
    runtimeStrip: {
      cell: 1,
      sources: Object.fromEntries(['portrait', 'tablet', 'desktop'].map((composition) => [
        composition,
        {
          avif: `https://example.test/${composition}.${'a'.repeat(64)}.avif`,
          webp: `https://example.test/${composition}.${'b'.repeat(64)}.webp`,
        },
      ])) as NonNullable<Scene['visual']['runtimeStrip']>['sources'],
    },
  },
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

    expect(markup).toContain('media="(orientation: portrait) and (max-width: 700px)"')
    expect(markup).toContain('media="(orientation: landscape) and (max-height: 500px), (min-width: 1100px)"')
    expect(markup).toContain('scenes/scene-1/portrait.avif')
    expect(markup).toContain('scenes/scene-1/tablet.webp')
    expect(markup).toContain('scenes/scene-1/desktop.avif')
    expect(markup).toContain('data-subject-safe-region')
    expect(markup).toContain('data-caption-phone-position="bottom"')
    expect(markup).toContain('--cw-caption-phonePortrait-y:78%')
    expect(markup).toContain('--cw-caption-desktop-height:12%')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Juror desk')
    expect(markup).not.toContain('Full screen')
    expect(markup).toContain('cross-examination')
    expect(markup).toContain('aria-live="polite"')
  })

  it('keeps full dialogue visible in audio fallback without visual or live-region duplication', () => {
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session}
        scene={scene}
        cue={cue}
        releaseBase="/media"
        accessMode="captions"
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
    expect(markup).not.toContain('class="cw-captions"')
    expect(markup).toContain('aria-live="off"')
    expect(markup).toContain('Continue')
  })

  it('selects one cell from a sealed responsive strip without a fetch or canvas layer', () => {
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session} scene={stripScene} cue={cue} releaseBase="/media"
        accessMode="audio-first" playbackStatus="paused" playbackError={null}
        progressLabel="Scene 1 of 3" deskOpen={false}
        onPlay={() => undefined} onPause={() => undefined} onRepeat={() => undefined}
        onAdvance={() => undefined} onToggleCaptions={() => undefined} onToggleDesk={() => undefined}
      />,
    )
    expect(markup).toContain('cw-stage__picture--strip')
    expect(markup).toContain('data-strip-cell="1"')
    expect(markup).toContain('object-position:79% 42%')
    expect(markup).toContain(`https://example.test/desktop.${'a'.repeat(64)}.avif`)
    expect(markup).toContain('referrerPolicy="no-referrer"')
    expect(markup).toContain('sizes="100vw"')
  })

  it('does not guess caption fit from character count before browser layout', () => {
    const longCue = {
      ...cue,
      text: 'The witness explains the complete sequence in enough detail that two visual lines cannot contain the legally material qualification, the source limitation, and the answer given in court.',
    }
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session} scene={scene} cue={longCue} releaseBase="/media"
        accessMode="captions" playbackStatus="playing" playbackError={null}
        progressLabel="Scene 1 of 3" deskOpen={false}
        onPlay={() => undefined} onPause={() => undefined} onRepeat={() => undefined}
        onAdvance={() => undefined} onToggleCaptions={() => undefined} onToggleDesk={() => undefined}
      />,
    )
    expect(markup).toContain('data-complete-captions="false"')
    expect(markup).toContain('data-caption-runtime-state="off"')
    expect(markup).toContain('class="cw-captions"')
    expect(markup).not.toContain('cw-reading-copy')
    expect(markup).toContain(longCue.text)
  })

  it('renders full reading copy when every permitted caption lane collides', () => {
    const blockedScene: Scene = {
      ...scene,
      visual: {
        ...scene.visual,
        subjectSafeRegion: { x: 0, y: 0, width: 100, height: 100 },
        evidenceSafeRegion: undefined,
        permittedCaptionPositions: ['bottom'],
      },
    }
    const markup = renderToStaticMarkup(
      <ImmersiveCourtShell
        session={session} scene={blockedScene} cue={cue} releaseBase="/media"
        accessMode="captions" playbackStatus="playing" playbackError={null}
        progressLabel="Scene 1 of 3" deskOpen={false}
        onPlay={() => undefined} onPause={() => undefined} onRepeat={() => undefined}
        onAdvance={() => undefined} onToggleCaptions={() => undefined} onToggleDesk={() => undefined}
      />,
    )
    expect(markup).toContain('data-caption-phone-fits="false"')
    expect(markup).toContain('class="cw-captions"')
    expect(markup).toContain(cue.text)
  })
})
