import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { DocketBeatView } from './DocketBeatView'

describe('DocketBeatView dialogue', () => {
  it('renders both speakers as an accessible alternating transcript', () => {
    const trial = makeDocketCase()
    trial.beats[1].turns = [
      { speaker: 'defc', text: 'Where were you that evening?' },
      { speaker: 'w1', text: 'I was reviewing the record.' },
    ]
    const markup = renderToStaticMarkup(
      <DocketBeatView
        trial={trial}
        beatIndex={1}
        narration={false}
        playbackRate={1}
        onNext={() => undefined}
      />,
    )

    expect(markup).toContain('aria-label="Cross-examination transcript"')
    expect(markup).toContain('Counsel Maddox')
    expect(markup).toContain('Renn Halloway')
    expect(markup).not.toContain('Speaking now')
  })
})
