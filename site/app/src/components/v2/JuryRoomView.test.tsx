import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { JuryRoomView } from './JuryRoomView'

describe('JuryRoomView', () => {
  it('shows autoplay controls, a short agenda, and hides seat votes', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Jury room transcript')
    expect(markup).toContain('Deliberation progress')
    expect(markup).toContain('Deliberation playback')
    expect(markup).toContain('Pause')
    expect(markup).toContain('Raise an issue')
    expect(markup).toContain('Discussion agenda')
    expect(markup).toContain('A short agenda')
    expect(markup).toContain('The room opens a short agenda')
    expect(markup).not.toContain('→ guilty')
    expect(markup).not.toContain('A show of hands:')
    expect(markup).not.toContain('Choose evidence, then argue')
  })
})
