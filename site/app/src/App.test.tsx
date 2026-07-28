import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IntroGate } from './App'

describe('IntroGate', () => {
  it('warns that the guided sitting is a complete non-graphic murder case', () => {
    const markup = renderToStaticMarkup(
      <IntroGate
        narration={false}
        playbackRate={1}
        onStartIntro={() => undefined}
        onSkip={() => undefined}
      />,
    )

    expect(markup).toContain('complete murder case')
    expect(markup).toContain('non-graphic references to death and serious violence')
    expect(markup).toContain('You can skip it')
    expect(markup).toContain('Take the guided intro')
    expect(markup).toContain('Skip to today')
  })
})
