import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocketShell } from './DocketChrome'

describe('DocketShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the case skip link and a labelled narration control', () => {
    vi.stubGlobal('window', { speechSynthesis: {} })
    const markup = renderToStaticMarkup(
      <DocketShell
        phase="beats"
        caseTitle="The Quiet Platform"
        dayNumber={12}
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">Case briefing</h1>
      </DocketShell>,
    )

    expect(markup).toContain('href="#phase-heading"')
    expect(markup).toContain('aria-label="Narration speed"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('Case briefing')
    expect(markup).toContain('aria-current="step"')
    expect(markup).toContain('Juror')
    expect(markup).toContain('Your progress and narration stay on this device')
  })
})
