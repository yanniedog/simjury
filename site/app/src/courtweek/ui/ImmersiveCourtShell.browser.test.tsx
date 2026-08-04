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
    expect(container.querySelector('.cw-stage__fallback')).not.toBeNull()
    expect(container.querySelector('picture')).not.toBeNull()
    act(() => image?.dispatchEvent(new Event('load')))
    expect(container.querySelector('.cw-stage__fallback')).toBeNull()
    act(() => root.unmount())
  })

  it('uses rendered line and collision geometry for short and long captions', async () => {
    let collision = false
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('.cw-shell')) return { left: 0, top: 0, right: 700, bottom: 900, width: 700, height: 900 } as DOMRect
      if (this.matches('.cw-captions span')) return { left: 100, top: 200, right: 600, bottom: 250, width: 500, height: 50 } as DOMRect
      if (this.matches('.cw-controls')) {
        return collision
          ? { left: 100, top: 230, right: 600, bottom: 320, width: 500, height: 90 } as DOMRect
          : { left: 100, top: 800, right: 600, bottom: 890, width: 500, height: 90 } as DOMRect
      }
      if (this.matches('.cw-speaker--collision-probe p')) return { left: 12, top: 700, right: 255, bottom: 750, width: 243, height: 50 } as DOMRect
      return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 } as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(50)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.matches('.cw-captions span') && this.textContent?.includes('qualification') ? 80 : 50
    })

    const root = createRoot(container)
    const renderCue = async (nextCue: SceneCue) => act(async () => root.render(
      <ImmersiveCourtShell
        session={session} scene={{ ...scene, cues: [nextCue] }} cue={nextCue} releaseBase="/assets"
        accessMode="captions" playbackStatus="paused" playbackError={null}
        progressLabel="Scene 1 of 3" deskOpen={false}
        onPlay={() => undefined} onPause={() => undefined} onRepeat={() => undefined}
        onAdvance={() => undefined} onToggleCaptions={() => undefined} onToggleDesk={() => undefined}
      />,
    ))

    await renderCue(cue)
    expect(container.querySelector('.cw-shell')?.getAttribute('data-caption-runtime-state')).toBe('fit')
    expect(container.querySelector('.cw-speaker .cw-reading-copy')).toBeNull()
    expect(container.querySelector('[aria-live]')?.getAttribute('aria-live')).toBe('polite')

    const longCue: SceneCue = {
      ...cue,
      id: 'cue-long',
      text: 'The qualification remains legally material and needs more than the two rendered lines available in this exact lane.',
    }
    await renderCue(longCue)
    expect(container.querySelector('.cw-shell')?.getAttribute('data-caption-runtime-reason')).toBe('line-overflow')
    expect(container.querySelector('.cw-speaker .cw-reading-copy')?.textContent).toBe(longCue.text)
    expect(container.querySelector('[aria-live]')?.getAttribute('aria-live')).toBe('off')
    expect(container.querySelector('[aria-live]')?.getAttribute('aria-hidden')).toBe('true')

    collision = true
    await renderCue({ ...cue, id: 'cue-collision' })
    expect(container.querySelector('.cw-shell')?.getAttribute('data-caption-runtime-reason')).toBe('controls-collision')
    expect(container.querySelectorAll('.cw-speaker .cw-reading-copy')).toHaveLength(1)
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(container.querySelector('.cw-shell')?.getAttribute('data-caption-runtime-reason')).toBe('controls-collision')
    act(() => root.unmount())
  })
})
