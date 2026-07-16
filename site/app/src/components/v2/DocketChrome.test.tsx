import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DocketShell } from './DocketChrome'

describe('DocketShell', () => {
  it('keeps the case skip link and a labelled narration control', () => {
    vi.stubGlobal('window', { speechSynthesis: {} })
    const markup = renderToStaticMarkup(
      <DocketShell
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
    vi.unstubAllGlobals()
  })
})
