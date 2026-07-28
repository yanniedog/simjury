import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase, makeV3DocketCase } from '../../lib/v2/fixtures'
import { SpeakerPortrait } from './SpeakerPortrait'

describe('SpeakerPortrait', () => {
  it('renders the authored courtroom sketch for a speaking character', () => {
    const markup = renderToStaticMarkup(
      <SpeakerPortrait trial={makeV3DocketCase()} speakerId="acc" />,
    )

    expect(markup).toContain('/today/media/dd-0001/characters/acc.webp')
    expect(markup).toContain('Courtroom sketch of acc')
  })

  it('renders nothing when a transitional case has no portrait', () => {
    expect(
      renderToStaticMarkup(
        <SpeakerPortrait trial={makeDocketCase()} speakerId="acc" />,
      ),
    ).toBe('')
  })
})
