import type { CSSProperties } from 'react'
import type { SceneVisual } from '../model/schema'

export type CaptionViewport = 'phonePortrait' | 'phoneLandscape' | 'tablet' | 'desktop'
type CaptionPosition = SceneVisual['captionPosition']
type Region = NonNullable<SceneVisual['subjectSafeRegion']>

export interface CaptionPlacement {
  position: CaptionPosition
  region: Region
}

const viewportZones: Record<CaptionViewport, Record<CaptionPosition, Region>> = {
  phonePortrait: {
    top: { x: 5, y: 14, width: 90, height: 20 },
    bottom: { x: 5, y: 64, width: 90, height: 28 },
    left: { x: 4, y: 24, width: 44, height: 42 },
    right: { x: 52, y: 24, width: 44, height: 42 },
  },
  phoneLandscape: {
    top: { x: 4, y: 15, width: 70, height: 22 },
    bottom: { x: 4, y: 62, width: 70, height: 30 },
    left: { x: 4, y: 24, width: 32, height: 52 },
    right: { x: 40, y: 24, width: 34, height: 52 },
  },
  tablet: {
    top: { x: 6, y: 12, width: 88, height: 20 },
    bottom: { x: 6, y: 66, width: 88, height: 24 },
    left: { x: 4, y: 22, width: 42, height: 54 },
    right: { x: 54, y: 22, width: 42, height: 54 },
  },
  desktop: {
    top: { x: 8, y: 11, width: 84, height: 18 },
    bottom: { x: 8, y: 68, width: 84, height: 22 },
    left: { x: 4, y: 20, width: 42, height: 58 },
    right: { x: 54, y: 20, width: 42, height: 58 },
  },
}

const viewportPreference: Record<CaptionViewport, CaptionPosition[]> = {
  phonePortrait: ['bottom', 'top', 'right', 'left'],
  phoneLandscape: ['left', 'top', 'bottom', 'right'],
  tablet: ['bottom', 'left', 'right', 'top'],
  desktop: ['bottom', 'left', 'right', 'top'],
}

function overlapArea(left: Region, right: Region): number {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

function protectedRegions(visual: SceneVisual): Region[] {
  return [visual.subjectSafeRegion, visual.evidenceSafeRegion].filter((region): region is Region => Boolean(region))
}

function keepOutsideProtectedLane(region: Region, position: CaptionPosition, protectedArea: Region[]): Region {
  if (!protectedArea.length) return region
  const minX = Math.min(...protectedArea.map((item) => item.x))
  const minY = Math.min(...protectedArea.map((item) => item.y))
  const maxX = Math.max(...protectedArea.map((item) => item.x + item.width))
  const maxY = Math.max(...protectedArea.map((item) => item.y + item.height))
  const edge = { ...region }

  if (position === 'bottom') {
    const nextY = Math.max(edge.y, maxY + 2)
    if (edge.y + edge.height - nextY >= 10) return { ...edge, y: nextY, height: edge.y + edge.height - nextY }
  } else if (position === 'top') {
    const nextHeight = Math.min(edge.height, minY - edge.y - 2)
    if (nextHeight >= 10) return { ...edge, height: nextHeight }
  } else if (position === 'left') {
    const nextWidth = Math.min(edge.width, minX - edge.x - 2)
    if (nextWidth >= 28) return { ...edge, width: nextWidth }
  } else {
    const nextX = Math.max(edge.x, maxX + 2)
    if (edge.x + edge.width - nextX >= 28) return { ...edge, x: nextX, width: edge.x + edge.width - nextX }
  }
  return region
}

export function captionPlacementFor(visual: SceneVisual, viewport: CaptionViewport): CaptionPlacement {
  const allowed = Array.from(new Set(visual.permittedCaptionPositions?.length
    ? visual.permittedCaptionPositions
    : [visual.captionPosition]))
  const protectedArea = protectedRegions(visual)
  const preference = viewportPreference[viewport]
  const position = [...allowed].sort((left, right) => {
    const leftOverlap = protectedArea.reduce((total, item) => total + overlapArea(viewportZones[viewport][left], item), 0)
    const rightOverlap = protectedArea.reduce((total, item) => total + overlapArea(viewportZones[viewport][right], item), 0)
    return leftOverlap - rightOverlap || preference.indexOf(left) - preference.indexOf(right)
  })[0] ?? visual.captionPosition
  return {
    position,
    region: keepOutsideProtectedLane(viewportZones[viewport][position], position, protectedArea),
  }
}

export function responsiveCaptionPlacements(visual: SceneVisual): Record<CaptionViewport, CaptionPlacement> {
  return Object.fromEntries(
    (Object.keys(viewportZones) as CaptionViewport[]).map((viewport) => [viewport, captionPlacementFor(visual, viewport)]),
  ) as Record<CaptionViewport, CaptionPlacement>
}

export function captionPlacementStyle(visual: SceneVisual): CSSProperties {
  const placements = responsiveCaptionPlacements(visual)
  const properties: Record<string, string> = {}
  for (const [viewport, placement] of Object.entries(placements)) {
    properties[`--cw-caption-${viewport}-x`] = `${placement.region.x}%`
    properties[`--cw-caption-${viewport}-y`] = `${placement.region.y}%`
    properties[`--cw-caption-${viewport}-width`] = `${placement.region.width}%`
    properties[`--cw-caption-${viewport}-height`] = `${placement.region.height}%`
  }
  return properties as CSSProperties
}
