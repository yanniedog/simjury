import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { ensureNpcNotes, recollectionStub, upsertPlayerNote } from '../../lib/jurorNotes'
import {
  phaseNarratorCue,
  REASONABLE_DOUBT_DIRECTION,
} from '../../lib/narratorCues'
import { JuryRoomView } from './JuryRoomView'

describe('JuryRoomView', () => {
  it('keeps deliberation on notes and memory — never quotes beat text', () => {
    const trial = makeDocketCase()
    const notes = ensureNpcNotes(
      trial,
      upsertPlayerNote([], trial.beats[0].id, 'Witness sounded unsure on the time.'),
    )
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={notes}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Reload notes')
    expect(markup).toContain('Discuss from notes and memory')
    expect(markup).not.toContain(trial.beats[0].text)
    expect(markup).not.toContain('Choose evidence, then argue')
  })

  it('makes narration-off deliberation explicitly user-paced', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration={false}
        playbackRate={1}
        notes={[]}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('Hear first point')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-atomic="true"')
    expect(markup).not.toContain('>Pause<')
  })

  it('keeps speech playback controls when narration is on', () => {
    const trial = makeDocketCase()
    const markup = renderToStaticMarkup(
      <JuryRoomView
        trial={trial}
        narration
        playbackRate={1}
        notes={[]}
        onSeal={() => undefined}
        onDone={() => undefined}
      />,
    )

    expect(markup).toContain('>Pause<')
    expect(markup).not.toContain('Hear first point')
  })

  it('explains the staged room without presenting it as legal doctrine', () => {
    const cue = phaseNarratorCue('juryroom')

    expect(cue).toContain('three focused rounds')
    expect(cue).toContain('pause, reopen written notes, or raise a point')
    expect(cue).toContain('choose your own verdict')
    expect(cue).toContain('Eleven matching votes')
    expect(cue).toContain('undecided jurors remain undecided')
    expect(cue).not.toMatch(/\blawful\b|\blegally required\b/i)
  })

  it('uses the complete reasonable-doubt direction', () => {
    expect(REASONABLE_DOUBT_DIRECTION).toBe(
      'If, after considering all the evidence, you are not sure the prosecution proved every element beyond reasonable doubt, your verdict must be Not Guilty.',
    )
    expect(phaseNarratorCue('verdict')).toBe(REASONABLE_DOUBT_DIRECTION)
  })
})

describe('juror note stubs', () => {
  it('build recollection stubs without copying primary text', () => {
    const trial = makeDocketCase()
    const beat = trial.beats[0]
    const juror = trial.jury.jurors[0]
    const stub = recollectionStub(trial, beat, juror)
    expect(stub.length).toBeGreaterThan(0)
    expect(stub.includes(beat.text)).toBe(false)
  })
})
