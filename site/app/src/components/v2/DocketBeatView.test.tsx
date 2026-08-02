import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import type { DocketInterjection } from '../../lib/v2/caseSchema'
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
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )

    expect(markup).toContain('aria-label="Cross-examination transcript"')
    expect(markup).toContain('Counsel Maddox')
    expect(markup).toContain('Renn Halloway')
    expect(markup).not.toContain('Speaking now')
    expect(markup).toContain('Jot a short recollection note')
    expect(markup).toContain('Review your evidence')
  })

  it('shows a cross-examination cue after direct of the same witness', () => {
    const trial = makeDocketCase()
    // beat 0 examination of w1, beat 1 cross of w1 in fixture
    const markup = renderToStaticMarkup(
      <DocketBeatView
        trial={trial}
        beatIndex={1}
        narration
        playbackRate={1}
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )
    expect(markup).toMatch(/cross-examination of/i)
  })

  // Finding 03: the cue printed the words that would have been spoken even
  // with narration off, which is the default.
  it('prints no narrator script when narration is off', () => {
    const markup = renderToStaticMarkup(
      <DocketBeatView
        trial={makeDocketCase()}
        beatIndex={1}
        narration={false}
        playbackRate={1}
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )

    expect(markup).not.toMatch(/cross-examination of/i)
    expect(markup).not.toContain('narrator-cue')
  })

  // Finding 08: the speaker was the phase heading and was then repeated inside
  // the card immediately below it. The toolbar line carries position and mode;
  // the card is the speaker's one home.
  it('names the speaker once, on the card, and heads the phase with position', () => {
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
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )

    expect(markup).toContain('id="phase-heading"')
    expect(markup).toMatch(/id="phase-heading"[^>]*>Evidence 2 of \d+ · Cross-examination</)
    // Each speaker is named exactly once — on their own card.
    expect(markup.match(/Counsel Maddox/g)).toHaveLength(1)
    expect(markup.match(/Renn Halloway/g)).toHaveLength(1)
  })

  it('renders an objection and exclusion in exact courtroom order', () => {
    const trial = makeDocketCase()
    const beat = trial.beats[1] as typeof trial.beats[number] & {
      interjections: DocketInterjection[]
    }
    beat.interjections = [
      {
        id: 'hearsay-objection',
        after_turn: 1,
        speaker: 'pros',
        type: 'objection',
        ground: 'hearsay',
        text: 'Objection, hearsay.',
      },
      {
        id: 'hearsay-ruling',
        after_turn: 1,
        speaker: 'judge',
        type: 'sustained',
        resolves: 'hearsay-objection',
        admissibility: { effect: 'exclude_beat' },
        text: 'Sustained. Disregard that answer.',
      },
    ]
    const markup = renderToStaticMarkup(
      <DocketBeatView
        trial={trial}
        beatIndex={1}
        narration={false}
        playbackRate={1}
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )

    expect(markup.indexOf('Where were you')).toBeLessThan(
      markup.indexOf('Objection · hearsay'),
    )
    expect(markup.indexOf('Objection · hearsay')).toBeLessThan(
      markup.indexOf('Sustained'),
    )
    expect(markup).toContain('Excluded from your deliberations')
    expect(markup).toContain('The court has directed you to disregard')
  })

})
