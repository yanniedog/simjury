import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FictionDisclosureGate, IntroGate } from './App'

describe('FictionDisclosureGate', () => {
  it('states the fiction premise once at site entry without grading the player', () => {
    const markup = renderToStaticMarkup(
      <FictionDisclosureGate onContinue={() => undefined} />,
    )

    expect(markup).toContain('Everything in SimJury is fictional')
    expect(markup).toContain('cases, people, places, evidence')
    expect(markup).toContain('Enter SimJury')
    expect(markup).not.toContain('correct')
  })
})

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
    expect(markup).toContain('case library')
    expect(markup).toContain('Take the guided intro')
    expect(markup).toContain('Skip to today')
  })
})
