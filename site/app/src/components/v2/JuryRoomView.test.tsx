import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { JuryRoomView } from './JuryRoomView'

describe('JuryRoomView', () => {
  it('shows the selected evidence and names the argument it supports', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        playerVerdict="Not Guilty"
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
  })
})
