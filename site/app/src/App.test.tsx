import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DocketApp, FictionDisclosureGate, IntroGate } from './App'
import { makeDocketCase } from './lib/v2/fixtures'
import type { DocketSittingV3 } from './lib/v2/cases'

describe('FictionDisclosureGate', () => {
  it('states the fiction and 18+ premise once at site entry without grading the player', () => {
    const markup = renderToStaticMarkup(
      <FictionDisclosureGate onContinue={() => undefined} />,
    )

    expect(markup).toContain('Everything in SimJury is fictional')
    expect(markup).toContain('cases, people, places, evidence')
    expect(markup).toContain('adults aged 18 and over')
    expect(markup).toContain('I’m 18 or older')
    expect(markup).toContain('I’m under 18 — leave')
    expect(markup).toContain('href="https://www.google.com/"')
    expect(markup).not.toContain('correct')
  })
})

describe('IntroGate', () => {
  it('warns that the guided sitting directly discusses death and serious violence', () => {
    const markup = renderToStaticMarkup(
      <IntroGate
        narration={false}
        playbackRate={1}
        onStartIntro={() => undefined}
        onSkip={() => undefined}
      />,
    )

    expect(markup).toContain('complete murder case')
    expect(markup).toContain('direct discussion of death and serious violence')
    expect(markup).toContain('You can skip it')
    expect(markup).toContain('case library')
    expect(markup).toContain('Take the guided intro')
    expect(markup).toContain('Skip to today')
  })
})

describe('DocketApp version routing', () => {
  it('preserves the existing V3 courtroom path', () => {
    const sitting = {
      day: 10,
      date: new Date('2026-08-02T00:00:00Z'),
      schemaVersion: 3,
      trial: makeDocketCase(),
    } satisfies DocketSittingV3
    const markup = renderToStaticMarkup(
      <DocketApp
        sitting={sitting}
        sittings={[sitting]}
        todayDay={10}
        featuredSitting={sitting}
        onSelect={() => undefined}
        intro={null}
      />,
    )

    expect(markup).toContain(sitting.trial.title)
    expect(markup).toContain('Take your seat')
    expect(markup).not.toContain('Put the case in your own words')
  })
})
