import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { NarratorCue } from './NarratorCue'
import { StatementCard } from './OpeningStatements'

describe('shared speaker focus', () => {
  it('flags the exact active counsel statement', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <StatementCard
        trial={trial}
        statement={trial.statements.opening.prosecution}
        side="prosecution"
        active
      />,
    )

    expect(markup).toContain('speech-turn-active')
    expect(markup).toContain('aria-current="true"')
    expect(markup).toContain('Speaking')
  })

  it('flags narrator text through the same treatment', () => {
    const markup = renderToStaticMarkup(
      <NarratorCue text="The court is ready." narration active />,
    )

    expect(markup).toContain('Narrator, speaking')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-atomic="true"')
    expect(markup).toContain('narrator-cue-active')
    expect(markup).toContain('Speaking')
  })

  // Finding 03. With narration off — the default — every phase still printed
  // the words that would have been spoken, in a prominent gold-bordered block.
  it('renders nothing at all when narration is off', () => {
    expect(
      renderToStaticMarkup(
        <NarratorCue text="The court is ready." narration={false} active />,
      ),
    ).toBe('')
  })
})
