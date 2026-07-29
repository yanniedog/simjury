import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { memoryLabel, upsertPlayerNote } from '../../lib/jurorNotes'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { EvidenceIndex } from './EvidenceIndex'

describe('EvidenceIndex', () => {
  it('hides future beats and shows notes without transcript text', () => {
    const trial = makeDocketCase()
    const future = trial.beats[3]
    const notes = upsertPlayerNote([], trial.beats[0].id, 'heard the ID soft')
    const markup = renderToStaticMarkup(
      <EvidenceIndex
        trial={trial}
        notes={notes}
        visibleBeatCount={2}
        selectedBeatId={trial.beats[0].id}
      />,
    )

    expect(markup).toContain('Evidence from this sitting')
    expect(markup).toContain('heard the ID soft')
    expect(markup).toContain('Memory only')
    expect(markup).not.toContain(future.id)
    expect(markup).not.toContain(future.text)
    expect(markup).not.toContain('reveal_note')
    expect(markup).not.toContain(trial.reference_verdict)
    expect(markup).not.toContain('misleading')
  })

  it('marks selection and already-raised states for keyboardable buttons', () => {
    const trial = makeDocketCase()
    const first = trial.beats[0]
    const second = trial.beats[1]
    const notes = upsertPlayerNote([], first.id, 'ID felt soft under pressure.')
    const markup = renderToStaticMarkup(
      <EvidenceIndex
        trial={trial}
        notes={notes}
        visibleBeatCount={trial.beats.length}
        selectedBeatId={second.id}
        raisedBeatIds={[first.id]}
        onSelectBeat={() => undefined}
      />,
    )

    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Already raised')
    expect(markup).toContain('already raised')
    expect(markup).toContain('ID felt soft under pressure.')
    expect(markup).toContain('<button')
    expect(markup).toContain(memoryLabel(trial, second.id).title)
  })

  it('applies selected class on read-only static rows', () => {
    const trial = makeDocketCase()
    const selected = trial.beats[1]
    const markup = renderToStaticMarkup(
      <EvidenceIndex
        trial={trial}
        notes={[]}
        visibleBeatCount={trial.beats.length}
        selectedBeatId={selected.id}
      />,
    )

    expect(markup).toContain('evidence-index-row static selected')
    expect(markup).not.toContain('<button')
  })
})
