import { describe, expect, it } from 'vitest'
import type { SceneVisual } from '../model/schema'
import { captionPlacementFor, captionPlacementStyle, responsiveCaptionPlacements } from './captionPlacement'

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
  })

  it('emits independent CSS lanes for phone, landscape, tablet and desktop', () => {
    const style = captionPlacementStyle(visual) as Record<string, string>
    expect(style['--cw-caption-phonePortrait-y']).toBeTruthy()
    expect(style['--cw-caption-phoneLandscape-width']).toBeTruthy()
    expect(style['--cw-caption-tablet-x']).toBeTruthy()
    expect(style['--cw-caption-desktop-height']).toBeTruthy()
  })
})
