import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { analyzeDocketPlay } from '../../lib/v2/analyze'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { DocketReveal } from './DocketReveal'

describe('DocketReveal', () => {
  it('presents the authored resolution as editorial guidance, not objective truth', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <DocketReveal
        trial={trial}
        analysis={analyzeDocketPlay(trial, 'Not Guilty')}
        verdict="Not Guilty"
        room={{
          kind: 'unanimous',
          verdict: 'not_guilty',
          g: 0,
          ng: 12,
        }}
        dayNumber={1}
        stats={{ played: 1, currentStreak: 1, maxStreak: 1 }}
        narration={false}
        playbackRate={1}
        onChooseAnother={() => undefined}
      />,
    )

    expect(markup).toContain('Authors’ reference verdict')
    expect(markup).toContain('authors’ intended resolution')
    expect(markup).toContain('editorial comparison')
    expect(markup).toContain('not an objectively correct answer')
    expect(markup).not.toContain('Case outcome')
    expect(markup).not.toContain('>Decisive<')
  })
})
