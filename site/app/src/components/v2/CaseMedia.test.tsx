import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MediaAsset } from '../../lib/v2/caseSchema'
import { mediaAssetSrc } from '../../lib/v2/mediaAssets'
import { CaseMedia, playerMediaCaption } from './CaseMedia'

const exhibit: MediaAsset = {
  src: '/today/media/dd-0001/evidence/ledger.webp',
  alt: 'A ledger open on a desk.',
  caption: 'Fictional reconstruction of the ledger.',
  kind: 'evidence',
}

describe('playerMediaCaption', () => {
  it('strips authoring fiction labels for player display', () => {
    expect(playerMediaCaption('Fictional court sketch of the hearing.')).toBe(
      'Court sketch of the hearing.',
    )
    expect(playerMediaCaption('Fictional character portrait of the accused.')).toBe(
      'Character portrait of the accused.',
    )
    expect(playerMediaCaption('Fictional reconstruction of the alley.')).toBe(
      'Reconstruction of the alley.',
    )
  })
})

describe('CaseMedia', () => {
  it('resolves the exhibit through the shared base-URL rewrite', () => {
    const markup = renderToStaticMarkup(<CaseMedia asset={exhibit} />)

    expect(markup).toContain(`src="${mediaAssetSrc(exhibit.src)}"`)
  })

  // React 18 does not recognise the camelCase spelling and logs a console
  // warning on every render of every case image.
  it('spells the priority hint in lowercase, which both React 18 and 19 pass through', () => {
    const markup = renderToStaticMarkup(<CaseMedia asset={exhibit} priority />)

    expect(markup).toContain('fetchpriority="high"')
    expect(markup).not.toContain('fetchPriority')
  })
})
