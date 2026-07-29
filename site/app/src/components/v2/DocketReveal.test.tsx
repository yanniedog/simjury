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
        analysis={analyzeDocketPlay(trial, 'Undecided')}
        verdict="Undecided"
        room={{
          kind: 'majority',
          verdict: 'not_guilty',
          g: 0,
          ng: 11,
          u: 1,
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
    expect(markup).toContain('Undecided')
    expect(markup).not.toContain('Case outcome')
  })

  it('shows a saved reflection challenge without scoring the player', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <DocketReveal
        trial={trial}
        analysis={analyzeDocketPlay(trial, 'Not Guilty')}
        verdict="Not Guilty"
        room={{
          kind: 'majority',
          verdict: 'not_guilty',
          g: 0,
          ng: 11,
          u: 1,
        }}
        reflection={{ counterargumentBeatId: trial.beats[0].id }}
        dayNumber={1}
        stats={{ played: 1, currentStreak: 1, maxStreak: 1 }}
        narration={false}
        playbackRate={1}
        onChooseAnother={() => undefined}
      />,
    )

    expect(markup).toContain('The challenge you carried into your verdict')
    expect(markup).toContain('Evidence ·')
    expect(markup).not.toMatch(/\bbias\b/i)
    expect(markup).not.toContain('bias score')
  })

  it('shows the no-single-point fallback for a persisted empty reflection', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <DocketReveal
        trial={trial}
        analysis={analyzeDocketPlay(trial, 'Not Guilty')}
        verdict="Not Guilty"
        room={{
          kind: 'majority',
          verdict: 'not_guilty',
          g: 0,
          ng: 11,
          u: 1,
        }}
        reflection={{}}
        dayNumber={1}
        stats={{ played: 1, currentStreak: 1, maxStreak: 1 }}
        narration={false}
        playbackRate={1}
        onChooseAnother={() => undefined}
      />,
    )

    expect(markup).toContain('The challenge you carried into your verdict')
    expect(markup).toContain('No single point stood out as the strongest challenge.')
  })

  it('surfaces misleading evidence as caution, not falsehood', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <DocketReveal
        trial={trial}
        analysis={analyzeDocketPlay(trial, 'Not Guilty')}
        verdict="Not Guilty"
        room={{
          kind: 'majority',
          verdict: 'not_guilty',
          g: 0,
          ng: 11,
          u: 1,
        }}
        dayNumber={1}
        stats={{ played: 1, currentStreak: 1, maxStreak: 1 }}
        narration={false}
        playbackRate={1}
        onChooseAnother={() => undefined}
      />,
    )

    expect(markup).toContain('What deserved more caution')
    expect(markup).toContain('Needs caution')
    expect(markup).not.toContain('tainted')
    expect(markup).not.toContain('false evidence')
    expect(markup).not.toMatch(/\bbias\b/i)
  })
})
