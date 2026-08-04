import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'

const COMPOSITIONS = {
  portrait: { ratio: 9 / 16, minimumWidth: 720, minimumHeight: 1280 },
  tablet: { ratio: 4 / 3, minimumWidth: 1024, minimumHeight: 768 },
  desktop: { ratio: 16 / 9, minimumWidth: 1280, minimumHeight: 720 },
}
const FORMATS = ['avif', 'webp']
const CAPTION_POSITIONS = new Set(['top', 'bottom', 'left', 'right'])
const REVIEW_STATUSES = new Set(['compatibility-migration', 'crop-reviewed'])

function filesBelow(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function uint24le(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

export function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('invalid WebP container')
  }
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + length > buffer.length) throw new Error('truncated WebP chunk')
    if (kind === 'VP8X' && length >= 10) {
      return { width: uint24le(buffer, data + 4) + 1, height: uint24le(buffer, data + 7) + 1 }
    }
    if (kind === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1]
      const b2 = buffer[data + 2]
      const b3 = buffer[data + 3]
      const b4 = buffer[data + 4]
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
      }
    }
    if (kind === 'VP8 ' && length >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      }
    }
    offset = data + length + (length % 2)
  }
  throw new Error('WebP dimensions are missing')
}

export function readAvifDimensions(buffer) {
  for (let index = 4; index + 16 <= buffer.length; index += 1) {
    if (buffer.toString('ascii', index, index + 4) !== 'ispe') continue
    const boxSize = buffer.readUInt32BE(index - 4)
    if (boxSize < 20 || index - 4 + boxSize > buffer.length) continue
    const width = buffer.readUInt32BE(index + 8)
    const height = buffer.readUInt32BE(index + 12)
    if (width > 0 && height > 0) return { width, height }
  }
  throw new Error('AVIF ispe dimensions are missing')
}

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100
}

function validRegion(region) {
  return region && [region.x, region.y, region.width, region.height].every(Number.isFinite) &&
    region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0 &&
    region.x + region.width <= 100 && region.y + region.height <= 100
}

function safeRelativePath(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\')) return null
  const target = resolve(root, relativePath)
  const normalizedRoot = `${resolve(root)}${sep}`
  return target.startsWith(normalizedRoot) ? target : null
}

export function assessSceneArtManifest(manifest, mediaRoot) {
  const root = resolve(mediaRoot)
  const gaps = []
  const referencedPaths = new Set()
  const contentOwners = new Map()
  const readySceneIds = []
  const compositionReadiness = {}
  const compatibilityMigrationSceneIds = new Set()
  const addGap = (sceneId, code, field, message) => gaps.push({ scene_id: sceneId, code, field, message })

  const supportedSchema = ['simjury.scene-art-manifest/v1', 'simjury.scene-art-manifest/v2'].includes(manifest?.schema)
  if (!supportedSchema || manifest?.caseId !== 'cw-0001') {
    addGap(null, 'invalid-manifest', 'schema', 'Expected a supported SimJury scene-art manifest for cw-0001.')
  }
  const entries = Object.entries(manifest?.scenes ?? {})
  if (entries.length !== 55) {
    addGap(null, 'scene-count', 'scenes', `Manifest has ${entries.length} scene keys; exactly 55 are required.`)
  }

  for (const [sceneId, entry] of entries) {
    const gapStart = gaps.length
    compositionReadiness[sceneId] = {}
    if (typeof entry.altDescription !== 'string' || entry.altDescription.trim().length < 20) {
      addGap(sceneId, 'invalid-alt', 'altDescription', 'A precise ambiguity-preserving alternative description is required.')
    }
    if (manifest?.schema === 'simjury.scene-art-manifest/v1') {
      addGap(sceneId, 'legacy-composition-metadata', 'compositionArt', 'V1 shared crop metadata must be explicitly reviewed and migrated per composition.')
    }

    const dimensionsByComposition = new Map()
    for (const [composition, contract] of Object.entries(COMPOSITIONS)) {
      const compositionGapStart = gaps.length
      const direction = manifest?.schema === 'simjury.scene-art-manifest/v2'
        ? entry.compositionArt?.[composition]
        : entry
      const directionField = manifest?.schema === 'simjury.scene-art-manifest/v2'
        ? `compositionArt.${composition}`
        : 'legacySharedDirection'
      if (!validPoint(direction?.focalPoint)) {
        addGap(sceneId, 'invalid-focal-point', `${directionField}.focalPoint`, `${composition} focal point must be within the 0-100 coordinate space.`)
      }
      for (const [field, code, label] of [
        ['subjectSafeRegion', 'missing-subject-safe-region', 'subject'],
        ['evidenceSafeRegion', 'missing-evidence-safe-region', 'evidence'],
      ]) {
        const value = direction?.[field]
        if (value === undefined) {
          addGap(sceneId, code, `${directionField}.${field}`, `${composition} requires an explicit ${label} region or null when none is visible.`)
        } else if (value !== null && !validRegion(value)) {
          addGap(sceneId, `invalid-${label}-safe-region`, `${directionField}.${field}`, `${composition} ${label} region must be a valid non-empty rectangle or null.`)
        }
      }
      if (!Array.isArray(direction?.permittedCaptionPositions) || direction.permittedCaptionPositions.length === 0 ||
        direction.permittedCaptionPositions.some((position) => !CAPTION_POSITIONS.has(position))) {
        addGap(sceneId, 'invalid-caption-positions', `${directionField}.permittedCaptionPositions`, `${composition} requires at least one supported caption position.`)
      }
      if (!REVIEW_STATUSES.has(direction?.reviewStatus)) {
        addGap(sceneId, 'invalid-review-status', `${directionField}.reviewStatus`, `${composition} requires an explicit crop-reviewed or compatibility-migration status.`)
      } else if (direction.reviewStatus === 'compatibility-migration') {
        compatibilityMigrationSceneIds.add(sceneId)
      }
      const formatDimensions = []
      for (const format of FORMATS) {
        const relativePath = entry.sources?.[composition]?.[format]
        const field = `sources.${composition}.${format}`
        const path = safeRelativePath(root, relativePath)
        if (!path || extname(path).toLowerCase() !== `.${format}`) {
          addGap(sceneId, 'invalid-source-path', field, `Dedicated ${composition} ${format.toUpperCase()} path is missing or unsafe.`)
          continue
        }
        const normalized = relative(root, path).split(sep).join('/')
        referencedPaths.add(normalized)
        if (/courtroom|shared|fallback/i.test(normalized)) {
          addGap(sceneId, 'generic-fallback-forbidden', field, 'Generic/shared/fallback imagery cannot satisfy a release-ready scene.')
        }
        if (!existsSync(path) || !statSync(path).isFile()) {
          addGap(sceneId, 'missing-file', field, `Missing dedicated art file: ${normalized}`)
          continue
        }
        const bytes = readFileSync(path)
        let dimensions
        try {
          dimensions = format === 'webp' ? readWebpDimensions(bytes) : readAvifDimensions(bytes)
        } catch (error) {
          addGap(sceneId, 'invalid-image', field, `${normalized}: ${error.message}`)
          continue
        }
        const actualRatio = dimensions.width / dimensions.height
        if (dimensions.width < contract.minimumWidth || dimensions.height < contract.minimumHeight) {
          addGap(sceneId, 'insufficient-resolution', field, `${normalized} is ${dimensions.width}x${dimensions.height}; minimum is ${contract.minimumWidth}x${contract.minimumHeight}.`)
        }
        if (Math.abs(actualRatio - contract.ratio) / contract.ratio > 0.015) {
          addGap(sceneId, 'wrong-aspect-ratio', field, `${normalized} is ${dimensions.width}x${dimensions.height}; ${composition} requires ${manifest.compositionContract?.[composition]?.aspectRatio}.`)
        }
        formatDimensions.push({ format, ...dimensions })
        const digest = createHash('sha256').update(bytes).digest('hex')
        const owner = contentOwners.get(digest)
        if (owner) {
          addGap(sceneId, 'duplicate-art-content', field, `${normalized} duplicates ${owner}; every rendition must be deliberately authored.`)
        } else {
          contentOwners.set(digest, normalized)
        }
      }
      dimensionsByComposition.set(composition, formatDimensions)
      if (formatDimensions.length === 2 &&
        (formatDimensions[0].width !== formatDimensions[1].width || formatDimensions[0].height !== formatDimensions[1].height)) {
        addGap(sceneId, 'codec-dimension-mismatch', `sources.${composition}`, `${composition} AVIF and WebP dimensions must match exactly.`)
      }
      compositionReadiness[sceneId][composition] = {
        ready: gaps.length === compositionGapStart,
        gap_count: gaps.length - compositionGapStart,
        review_status: direction?.reviewStatus ?? null,
        crop_review_complete: direction?.reviewStatus === 'crop-reviewed',
      }
    }
    if (gaps.length === gapStart) readySceneIds.push(sceneId)
    else addGap(sceneId, 'generic-fallback-forbidden', 'releaseReadiness', 'This scene has no complete dedicated art set and would fall back to generic imagery.')
  }

  for (const path of filesBelow(root)) {
    const normalized = relative(root, path).split(sep).join('/')
    if (['.avif', '.webp'].includes(extname(path).toLowerCase()) && !referencedPaths.has(normalized)) {
      addGap(null, 'unreferenced-visual-asset', normalized, 'Visual media is not owned by a SceneArtManifest entry and cannot ship release-ready.')
    }
  }

  return {
    schema: 'simjury.scene-art-readiness/v1',
    case_id: 'cw-0001',
    source_revision: manifest?.sourceRevision ?? null,
    manifest_schema: manifest?.schema ?? null,
    scene_count: entries.length,
    ready_scene_count: readySceneIds.length,
    release_ready: gaps.length === 0 && entries.length === 55,
    gap_count: gaps.length,
    ready_scene_ids: readySceneIds,
    crop_review_complete: entries.length === 55 && compatibilityMigrationSceneIds.size === 0 &&
      Object.values(compositionReadiness).every((scene) => Object.values(scene).every((composition) => composition.crop_review_complete)),
    compatibility_migration_scene_ids: [...compatibilityMigrationSceneIds],
    composition_readiness: compositionReadiness,
    gaps,
  }
}
