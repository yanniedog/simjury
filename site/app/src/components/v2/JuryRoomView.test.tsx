import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { JuryRoomView } from './JuryRoomView'

describe('JuryRoomView', () => {
  it('shows the selected evidence and hides seat votes during deliberation', () => {
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
    expect(markup).toContain('Evidence 1')
    expect(markup).toContain(trial.beats[0].text)
    expect(markup).toContain('Argue this supports conviction')
    expect(markup).toContain('Challenge its reliability')
    expect(markup).toContain('Votes stay private until the judge reads them out')
    expect(markup).not.toContain('→ guilty')
    expect(markup).not.toContain('A show of hands')
  })
})
