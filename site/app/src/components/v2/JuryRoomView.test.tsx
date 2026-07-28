import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { ensureNpcNotes, recollectionStub, upsertPlayerNote } from '../../lib/jurorNotes'
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
