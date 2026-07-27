import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { JuryRoomView } from './JuryRoomView'

describe('JuryRoomView', () => {
  it('shows evidence chips, round progress, and hides seat votes during deliberation', () => {
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
    expect(markup).toContain('Evidence from the trial')
    expect(markup).toContain('Evidence 1')
    expect(markup).toContain(trial.beats[0].text)
    expect(markup).toContain('Argue this supports conviction')
    expect(markup).toContain('Challenge its reliability')
    expect(markup).toContain('Pass — let the room talk this round')
    expect(markup).toContain('Three points with the room')
    expect(markup).toContain('Pick evidence and make your first point')
    expect(markup).not.toContain('→ guilty')
    expect(markup).not.toContain('A show of hands:')
    expect(markup).not.toContain('authored case record')
  })
})
