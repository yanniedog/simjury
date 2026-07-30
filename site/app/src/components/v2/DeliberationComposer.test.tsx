// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { jurorProfiles } from '../../engine/jurorProfile'
import { startPersuasion } from '../../engine/persuasion'
import {
  claimApplies,
  MOVE_LABEL,
  movesForBeatKind,
} from '../../lib/moveCopy'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { DeliberationComposer } from './DeliberationComposer'

const trial = makeDocketCase()
const profiles = jurorProfiles(trial.jury.jurors)

function composer(overrides: Record<string, unknown> = {}) {
  const beat = trial.beats.find((b) => b.kind !== 'direction')!
  return renderToStaticMarkup(
    <DeliberationComposer
      trial={trial}
      notes={[]}
      profiles={profiles}
      relations={startPersuasion(profiles.map(({ id }) => id)).byJuror}
      selectedBeatId={beat.id}
      raisedBeatIds={[]}
      move="assert"
      claim="NG"
      targetJurorId=""
      supportBeatId=""
      concernText=""
      feedback={null}
      overrideBeat={false}
      onSelectBeat={() => undefined}
      onMoveChange={() => undefined}
      onClaimChange={() => undefined}
      onTargetChange={() => undefined}
      onSupportChange={() => undefined}
      onConcernChange={() => undefined}
      onSubmit={() => undefined}
      onCancel={() => undefined}
      {...overrides}
    />,
  )
}

describe('move availability', () => {
  it('offers evidence techniques for evidence and bench techniques for a direction', () => {
    expect(movesForBeatKind('testimony')).toContain('challenge_inference')
    expect(movesForBeatKind('testimony')).not.toContain('apply_direction')
    expect(movesForBeatKind('direction')).toEqual(['apply_direction', 'ask_reason'])
  })

  it('knows which techniques carry a direction at all', () => {
    expect(claimApplies('assert')).toBe(true)
    expect(claimApplies('ask_reason')).toBe(false)
    expect(claimApplies('apply_direction')).toBe(false)
  })
})

describe('DeliberationComposer', () => {
  it('offers the technique as a separate choice from the direction', () => {
    const markup = composer()

    for (const move of movesForBeatKind('testimony')) {
      expect(markup).toContain(MOVE_LABEL[move])
    }
    expect(markup).toContain('Which way does it cut?')
    expect(markup).toContain('This raises doubt')
  })

  it('hides the direction control for a technique that pushes no position', () => {
    const markup = composer({ move: 'ask_reason' })

    expect(markup).not.toContain('Which way does it cut?')
    expect(markup).toContain('Put the question')
  })

  it('only offers a second recollection that shares a theme', () => {
    const beat = trial.beats.find((b) => b.kind !== 'direction')!
    const markup = composer({ move: 'connect_evidence' })
    const linkable = trial.beats.filter(
      (candidate) =>
        candidate.id !== beat.id
        && candidate.kind !== 'direction'
        && candidate.tags.some((tag) => beat.tags.includes(tag)),
    )

    expect(markup).toContain('Tie it to')
    for (const option of linkable) {
      expect(markup).toContain(`value="${option.id}"`)
    }
    expect(markup).not.toContain(`value="${beat.id}"`)
  })

  it('never quotes primary evidence text into the composer', () => {
    const markup = composer()
    expect(markup).not.toContain(trial.beats[0].text)
  })
})
