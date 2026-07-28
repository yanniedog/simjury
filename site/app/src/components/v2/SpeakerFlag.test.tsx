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
      <NarratorCue text="The court is ready." active />,
    )

    expect(markup).toContain('Narrator, speaking')
    expect(markup).toContain('speech-turn-active')
    expect(markup).toContain('Speaking')
  })
})
