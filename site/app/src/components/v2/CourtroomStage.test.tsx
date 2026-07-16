import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { CourtroomStage } from './CourtroomStage'

describe('CourtroomStage', () => {
  it('identifies the active speaker without relying on colour alone', () => {
    const markup = renderToStaticMarkup(
      <CourtroomStage
        trial={makeDocketCase()}
        activeSpeakerId="w1"
        phaseLabel="Evidence"
      />,
    )

    expect(markup).toContain('aria-label="Courtroom stage: Evidence"')
    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('Renn Halloway')
    expect(markup).toContain('Speaking now')
    expect(markup).toContain('is speaking.')
  })

  it('does not mark an empty witness stand as active', () => {
    const markup = renderToStaticMarkup(
      <CourtroomStage trial={makeDocketCase()} phaseLabel="Opening statements" />,
    )

    expect(markup).not.toContain('aria-current="true"')
    expect(markup).not.toContain('Speaking now')
  })
})
