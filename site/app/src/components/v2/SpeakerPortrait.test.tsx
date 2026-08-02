import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase, makeV3DocketCase } from '../../lib/v2/fixtures'
import { mediaAssetSrc } from '../../lib/v2/mediaAssets'
import { SpeakerPortrait } from './SpeakerPortrait'

describe('SpeakerPortrait', () => {
  it('renders the authored courtroom sketch for a speaking character', () => {
    const markup = renderToStaticMarkup(
      <SpeakerPortrait trial={makeV3DocketCase()} speakerId="acc" />,
    )

    expect(markup).toContain(
      `${import.meta.env.BASE_URL}media/dd-0001/characters/acc.webp`,
    )
    expect(markup).toContain('Courtroom sketch of acc')
  })

  // The authored prefix is what breaks portraits under `vite dev`, where the
  // app is served from `/` rather than `/today/`. CaseMedia always rewrote it;
  // this component did not, so faces were invisible exactly where a developer
  // would go looking for them.
  it('resolves the portrait through the shared base-URL rewrite', () => {
    const markup = renderToStaticMarkup(
      <SpeakerPortrait trial={makeV3DocketCase()} speakerId="acc" />,
    )

    expect(markup).toContain(`src="${mediaAssetSrc(
      '/today/media/dd-0001/characters/acc.webp',
    )}"`)
  })

  it('renders nothing when a transitional case has no portrait', () => {
    expect(
      renderToStaticMarkup(
        <SpeakerPortrait trial={makeDocketCase()} speakerId="acc" />,
      ),
    ).toBe('')
  })
})
