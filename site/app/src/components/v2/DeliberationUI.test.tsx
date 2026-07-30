// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { jurorProfiles } from '../../engine/jurorProfile'
import { applyAppeal, startPersuasion, type JurorReception } from '../../engine/persuasion'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { ensureNpcNotes } from '../../lib/jurorNotes'
import { MOVE_LABEL } from '../../lib/moveCopy'
import { themeLabel } from '../../lib/themeCopy'
import { claimApplies, movesForBeatKind } from '../../lib/moveCopy'
import { DeliberationComposer } from './DeliberationComposer'
import { JuryDossierPanel } from './JurorDossier'
import { RoomRead } from './RoomRead'

const trial = makeDocketCase()
const profiles = jurorProfiles(trial.jury.jurors)

/** Anything a leaning or a tally would look like in player-visible copy. */
const LEAK = /guilty|not guilty|undecided|acquit|convict|\b\d+\s*[-–]\s*\d+\b/i

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

describe('JuryDossierPanel', () => {
  const markup = renderToStaticMarkup(
    <JuryDossierPanel
      trial={trial}
      profiles={profiles}
      relations={startPersuasion(profiles.map(({ id }) => id)).byJuror}
      tells={{}}
      notes={ensureNpcNotes(trial, [])}
      expandedId={profiles[0].id}
      onExpand={() => undefined}
    />,
  )

  it('gives every juror an authored persona and a way in', () => {
    expect(markup).toContain(profiles[0].persona)
    for (const profile of profiles) {
      expect(markup).toContain(profile.label)
    }
  })

  it('names the themes a juror weighs in plain English, not enum slugs', () => {
    const focus = profiles[0].caresAbout[0]
    if (focus) {
      expect(markup).toContain(themeLabel(focus))
      expect(markup).not.toContain(`>${focus}<`)
    }
  })

  it('shows standing and attention but never a leaning or a tally', () => {
    expect(markup).toContain('Where you stand')
    expect(markup.replace(/Not moving yet/g, '')).not.toMatch(LEAK)
  })

  it('keeps the reference verdict and reveal notes out of the room', () => {
    expect(markup).not.toContain(trial.beats[0].reveal_note)
    expect(markup).not.toContain(trial.beats[0].text)
  })
})

describe('RoomRead', () => {
  const state = startPersuasion(profiles.map(({ id }) => id))
  const beat = trial.beats.find((b) => b.kind !== 'direction')!
  const receptions = applyAppeal(state, profiles, {
    move: 'challenge_inference',
    beatId: beat.id,
    beatTags: beat.tags,
  })

  it('announces itself, since it appears in response to the player speaking', () => {
    const markup = renderToStaticMarkup(
      <RoomRead summary="1 juror turned toward you." receptions={receptions} profiles={profiles} />
    )

    expect(markup).toContain('role="status"')
  })

  it('reads engagement back to the player without leaking a position', () => {
    const markup = renderToStaticMarkup(
      <RoomRead summary="2 jurors turned toward you." receptions={receptions} profiles={profiles} />
    )

    expect(markup).toContain('turned toward you')
    expect(markup).not.toMatch(LEAK)
  })

  it('surfaces when a point sits on a juror’s own subject', () => {
    const owned = receptions.filter((item) => item.ownSubject)
    const markup = renderToStaticMarkup(
      <RoomRead summary="" receptions={receptions} profiles={profiles} />
    )

    if (owned.length > 0) expect(markup).toContain('Their subject')
    expect(markup).not.toMatch(LEAK)
  })
})

describe('RoomRead keeps the cost of a technique visible', () => {
  const profiles = jurorProfiles(makeDocketCase().jury.jurors)

  const base: JurorReception = {
    jurorId: '',
    reception: 'open',
    tell: 'Leans in.',
    multiplier: 1,
    rapport: 0,
    rapportDelta: 0,
    ownSubject: false,
    discounts: false,
    backfired: false,
  }

  function reception(index: number, over: Partial<JurorReception> = {}): JurorReception {
    return { ...base, jurorId: profiles[index].id, ...over }
  }

  it('shows a backfire even when four other jurors moved further', () => {
    // The read is capped at four entries. Ordering purely by reception put every
    // positive response ahead of the one that blew up, so the player was told
    // someone closed off and never shown who or why.
    const html = renderToStaticMarkup(
      <RoomRead
        summary="The room split."
        profiles={profiles}
        receptions={[
          reception(0),
          reception(1),
          reception(2),
          reception(3),
          reception(4, { reception: 'shut', tell: 'Folds their arms.', backfired: true }),
        ]}
      />,
    )
    expect(html).toContain('Took it personally')
    expect(html).toContain('Folds their arms.')
  })

  it('still leads with the strongest reception when nothing backfired', () => {
    const html = renderToStaticMarkup(
      <RoomRead
        summary="It landed."
        profiles={profiles}
        receptions={[
          reception(0, { reception: 'resistant', tell: 'Pushes back.' }),
          reception(1, { reception: 'open', tell: 'Leans in.' }),
        ]}
      />,
    )
    expect(html.indexOf('Leans in.')).toBeLessThan(html.indexOf('Pushes back.'))
  })
})
