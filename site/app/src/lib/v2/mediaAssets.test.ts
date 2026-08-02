import { describe, expect, it } from 'vitest'
import { mediaAssetSrc } from './mediaAssets'

describe('mediaAssetSrc', () => {
  it('rewrites the authored /today/ prefix to this bundle’s base', () => {
    expect(mediaAssetSrc('/today/media/dd-0001/characters/acc.webp')).toBe(
      `${import.meta.env.BASE_URL}media/dd-0001/characters/acc.webp`,
    )
  })

  it('leaves a path that does not carry the authored prefix alone', () => {
    expect(mediaAssetSrc('/media/loose.webp')).toBe('/media/loose.webp')
    expect(mediaAssetSrc('https://example.invalid/x.webp')).toBe(
      'https://example.invalid/x.webp',
    )
  })

  it('rewrites only the leading prefix, never a later occurrence', () => {
    expect(mediaAssetSrc('/today/media/today/shot.webp')).toBe(
      `${import.meta.env.BASE_URL}media/today/shot.webp`,
    )
  })
})
