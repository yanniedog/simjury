import { describe, expect, it } from 'vitest'
import type { SceneVisual } from '../model/schema'
import {
  captionPlacementFor,
  captionPlacementStyle,
  captionViewportForSize,
  evaluateCaptionRuntimeFit,
  responsiveCaptionPlacements,
  type CaptionRect,
} from './captionPlacement'

const visual: SceneVisual = {
  fallbackId: 'courtroom',
  alt: 'A neutral courtroom composition.',
  focalPoint: { x: 50, y: 45 },
  captionPosition: 'bottom',
  permittedCaptionPositions: ['top', 'bottom', 'left', 'right'],
  subjectSafeRegion: { x: 10, y: 58, width: 80, height: 30 },
  evidenceSafeRegion: { x: 30, y: 65, width: 40, height: 20 },
}

function overlap(left: { x: number; y: number; width: number; height: number }, right: typeof left) {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)) *
    Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
}

describe('responsive caption placement', () => {
  it('selects only permitted lanes with the least protected-region overlap', () => {
    for (const placement of Object.values(responsiveCaptionPlacements(visual))) {
      expect(visual.permittedCaptionPositions).toContain(placement.position)
      expect(overlap(placement.region, visual.subjectSafeRegion!)).toBe(0)
      expect(overlap(placement.region, visual.evidenceSafeRegion!)).toBe(0)
    }
  })

  it('moves a required bottom caption below the scene-specific safe region', () => {
    const bottomOnly: SceneVisual = {
      ...visual,
      permittedCaptionPositions: ['bottom'],
      subjectSafeRegion: { x: 14, y: 18, width: 72, height: 60 },
      evidenceSafeRegion: { x: 30, y: 24, width: 40, height: 42 },
    }
    const placement = captionPlacementFor(bottomOnly, 'phonePortrait')
    expect(placement.position).toBe('bottom')
    expect(placement.region).toEqual({ x: 5, y: 80, width: 90, height: 12 })
    expect(placement.fits).toBe(true)
  })

  it('reports no fit when every permitted lane intersects protected content', () => {
    const blocked: SceneVisual = {
      ...visual,
      subjectSafeRegion: { x: 0, y: 0, width: 100, height: 100 },
      evidenceSafeRegion: undefined,
    }
    for (const viewport of ['phonePortrait', 'phoneLandscape', 'tablet', 'desktop'] as const) {
      expect(captionPlacementFor(blocked, viewport).fits).toBe(false)
    }
  })

  it('uses the active composition direction instead of flat tablet compatibility data', () => {
    const directed = {
      ...visual,
      compositionArt: {
        portrait: {
          subjectSafeRegion: { x: 0, y: 55, width: 100, height: 45 }, evidenceSafeRegion: null,
          permittedCaptionPositions: ['top', 'bottom'],
        },
        tablet: {
          subjectSafeRegion: { x: 0, y: 0, width: 100, height: 45 }, evidenceSafeRegion: null,
          permittedCaptionPositions: ['top', 'bottom'],
        },
        desktop: {
          subjectSafeRegion: { x: 50, y: 0, width: 50, height: 100 }, evidenceSafeRegion: null,
          permittedCaptionPositions: ['left', 'right'],
        },
      },
    } as unknown as SceneVisual
    const placements = responsiveCaptionPlacements(directed)
    expect(placements.phonePortrait.position).toBe('top')
    expect(placements.tablet.position).toBe('bottom')
    expect(placements.phoneLandscape.position).toBe('left')
    expect(placements.desktop.position).toBe('left')
  })

  it('emits independent CSS lanes for phone, landscape, tablet and desktop', () => {
    const style = captionPlacementStyle(responsiveCaptionPlacements(visual)) as Record<string, string>
    expect(style['--cw-caption-phonePortrait-y']).toBeTruthy()
    expect(style['--cw-caption-phoneLandscape-width']).toBeTruthy()
    expect(style['--cw-caption-tablet-x']).toBeTruthy()
    expect(style['--cw-caption-desktop-height']).toBeTruthy()
  })

  it.each([
    [320, 568, 'phonePortrait'],
    [844, 390, 'phoneLandscape'],
    [500, 900, 'phonePortrait'],
    [700, 900, 'tablet'],
    [720, 450, 'phoneLandscape'],
  ] as const)('selects the runtime lane for a %ix%i layout viewport', (width, height, expected) => {
    expect(captionViewportForSize(width, height)).toBe(expected)
  })

  it.each([
    ['320x568 controls', { left: 16, top: 414, right: 304, bottom: 472 }, { left: 8, top: 452, right: 312, bottom: 560 }, { left: 12, top: 350, right: 255, bottom: 389 }, 'controls-collision'],
    ['844x390 controls', { left: 71, top: 282, right: 587, bottom: 318 }, { left: 211, top: 274, right: 633, bottom: 382 }, { left: 12, top: 172, right: 255, bottom: 211 }, 'controls-collision'],
    ['500px split speaker', { left: 25, top: 673, right: 475, bottom: 731 }, { left: 8, top: 806, right: 492, bottom: 892 }, { left: 12, top: 711, right: 255, bottom: 750 }, 'speaker-collision'],
    ['700px split speaker', { left: 92, top: 684, right: 608, bottom: 720 }, { left: 94, top: 806, right: 606, bottom: 892 }, { left: 12, top: 711, right: 255, bottom: 750 }, 'speaker-collision'],
    ['1440 desktop at 200% controls', { left: 29, top: 318, right: 533, bottom: 375 }, { left: 180, top: 334, right: 540, bottom: 442 }, { left: 12, top: 232, right: 255, bottom: 271 }, 'controls-collision'],
  ] as const)('rejects the reported %s collision', (_name, overlay, controls, speaker, reason) => {
    expect(evaluateCaptionRuntimeFit({
      placementFits: true,
      overlay: overlay as CaptionRect,
      controls: controls as CaptionRect,
      speaker: speaker as CaptionRect,
      clientHeight: 58,
      scrollHeight: 58,
    })).toEqual({ fits: false, reason })
  })

  it('accepts actual two-line copy only when it fits and remains collision-free', () => {
    const clear = evaluateCaptionRuntimeFit({
      placementFits: true,
      overlay: { left: 200, top: 220, right: 620, bottom: 270 },
      controls: { left: 200, top: 800, right: 620, bottom: 890 },
      speaker: { left: 12, top: 700, right: 255, bottom: 750 },
      clientHeight: 50,
      scrollHeight: 50,
    })
    const overflow = evaluateCaptionRuntimeFit({
      placementFits: true,
      overlay: { left: 200, top: 220, right: 620, bottom: 270 },
      controls: { left: 200, top: 800, right: 620, bottom: 890 },
      speaker: { left: 12, top: 700, right: 255, bottom: 750 },
      clientHeight: 50,
      scrollHeight: 76,
    })
    expect(clear).toEqual({ fits: true, reason: null })
    expect(overflow).toEqual({ fits: false, reason: 'line-overflow' })
  })
})
