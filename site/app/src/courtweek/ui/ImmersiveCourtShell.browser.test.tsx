// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourtSession, Scene, SceneCue } from '../model/schema'
import { ImmersiveCourtShell } from './ImmersiveCourtShell'

const cue: SceneCue = {
  id: 'cue-1', event: 'witness-chief', speaker: 'Witness', text: 'Evidence.',
  accessibleProposition: 'The witness gives evidence.', tone: 'chief', evidenceIds: [], replayable: false,
}
const scene: Scene = {
  id: 'scene-1', title: 'Evidence', phase: 'crown-case',
  visual: { fallbackId: 'witness', alt: 'Witness in court.', focalPoint: { x: 50, y: 50 }, captionPosition: 'bottom' },
  cues: [cue], transitionSeconds: 3,
}
const session: CourtSession = {
  id: 'monday', ordinal: 1, day: 'Monday', title: 'Evidence',
  unlockAt: '2026-08-10T08:30:00+10:00', targetMinutes: 20,
  prerequisiteSessionIds: [], scenes: [scene, scene, scene],
}

describe('ImmersiveCourtShell browser behavior', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
  })
  afterEach(() => {
    container.remove()
    vi.restoreAllMocks()
  })

  it('treats native full screen as optional and survives viewport changes', async () => {
    const play = vi.fn()
    const root = createRoot(container)
    const requestFullscreen = vi.fn(async () => undefined)
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })
    await act(async () => root.render(
      <ImmersiveCourtShell
        session={session} scene={scene} cue={cue} releaseBase="/assets"
        accessMode="audio-first" playbackStatus="paused" playbackError={null}
        progressLabel="Scene 1 of 3" deskOpen={false}
        onPlay={play} onPause={() => undefined} onRepeat={() => undefined}
        onAdvance={() => undefined} onToggleCaptions={() => undefined} onToggleDesk={() => undefined}
      />,
    ))

    const fullscreen = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Full screen',
    )
    await act(async () => fullscreen?.click())
    expect(requestFullscreen).toHaveBeenCalledOnce()

    act(() => {
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('orientationchange'))
    })
    expect(play).not.toHaveBeenCalled()
    expect(container.querySelector('.cw-shell')).not.toBeNull()

    const image = container.querySelector('img')
    act(() => image?.dispatchEvent(new Event('error')))
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/assets/courtroom-wide.webp')
    act(() => container.querySelector('img')?.dispatchEvent(new Event('error')))
    expect(container.querySelector('.cw-stage__fallback')).not.toBeNull()
    act(() => root.unmount())
  })
})
