import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { sittingProgress } from '../../lib/v2/sittingProgress'
import { nextBeatLabel } from '../../lib/v2/beatCopy'
import { DocketBeatView } from './DocketBeatView'

/**
 * Finding 06. The top bar showed six equally weighted stages. Stage three,
 * Evidence, is fourteen beats and roughly half the twenty minutes — and the bar
 * did not move for any of them. A progress indicator that is frozen for the
 * longest stretch is worse than none, because it actively suggests nothing is
 * happening.
 */
describe('sittingProgress', () => {
  it('gives evidence half the sitting, not a sixth', () => {
    const beforeEvidence = sittingProgress('openings')
    const afterEvidence = sittingProgress('beats')

    expect(afterEvidence - beforeEvidence).toBeCloseTo(0.5, 5)
  })

  it('moves on every beat rather than once per phase', () => {
    const first = sittingProgress('beats', 1 / 14)
    const seventh = sittingProgress('beats', 7 / 14)
    const last = sittingProgress('beats', 14 / 14)

    expect(first).toBeLessThan(seventh)
    expect(seventh).toBeLessThan(last)
    // Fourteen beats are fourteen distinct positions, not one.
    const positions = new Set(
      Array.from({ length: 14 }, (_, index) => sittingProgress('beats', (index + 1) / 14)),
    )
    expect(positions.size).toBe(14)
  })

  it('runs monotonically from the briefing to the record', () => {
    const phases = ['intro', 'openings', 'beats', 'closings', 'juryroom', 'reveal'] as const
    const values = phases.map((phase) => sittingProgress(phase))

    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(values.at(-1)).toBe(1)
  })

  it('clamps a phase fraction outside 0–1', () => {
    expect(sittingProgress('beats', -5)).toBe(sittingProgress('beats', 0))
    expect(sittingProgress('beats', 5)).toBe(sittingProgress('beats', 1))
  })
})

describe('nextBeatLabel', () => {
  const trial = makeDocketCase()

  it('names the closing arguments at the end of the evidence', () => {
    expect(nextBeatLabel(trial, trial.beats[0], undefined)).toBe(
      'Hear the closing arguments',
    )
  })

  it('names who is coming rather than saying Next fourteen times', () => {
    const labels = trial.beats.map((beat, index) =>
      nextBeatLabel(trial, beat, trial.beats[index + 1]),
    )

    for (const label of labels) {
      expect(label).not.toBe('Next →')
      expect(label.length).toBeGreaterThan(4)
    }
    // The witness beats name a person.
    expect(labels.some((label) => /Hear |Cross-examine /.test(label))).toBe(true)
  })
})

describe('the evidence segments', () => {
  it('marks each beat done, current or still to come', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <DocketBeatView
        trial={trial}
        beatIndex={2}
        narration={false}
        playbackRate={1}
        notes={[]}
        onNoteChange={() => undefined}
        onNext={() => undefined}
      />,
    )

    const segments = [...markup.matchAll(/<li class="(done|current)?"/g)].map((m) => m[1])
    expect(segments.filter((state) => state === 'done')).toHaveLength(2)
    expect(segments.filter((state) => state === 'current')).toHaveLength(1)
    expect(segments).toHaveLength(trial.beats.length)
  })
})
