// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { jurorProfiles } from '../../engine/jurorProfile'
import { applyAppeal, startPersuasion, type JurorReception } from '../../engine/persuasion'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { RoomRead } from './RoomRead'

const trial = makeDocketCase()
const profiles = jurorProfiles(trial.jury.jurors)
const LEAK = /guilty|not guilty|undecided|acquit|convict|\b\d+\s*[-–]\s*\d+\b/i

describe('RoomRead', () => {
  const state = startPersuasion(profiles.map(({ id }) => id))
  const beat = trial.beats.find((candidate) => candidate.kind !== 'direction')!
  const receptions = applyAppeal(state, profiles, {
    move: 'challenge_inference',
    beatId: beat.id,
    beatTags: beat.tags,
  })

  it('announces the response to the player speaking', () => {
    const markup = renderToStaticMarkup(
      <RoomRead summary="1 juror turned toward you." receptions={receptions} profiles={profiles} />,
    )

    expect(markup).toContain('role="status"')
  })

  it('reports engagement without leaking a position', () => {
    const markup = renderToStaticMarkup(
      <RoomRead summary="2 jurors turned toward you." receptions={receptions} profiles={profiles} />,
    )

    expect(markup).toContain('turned toward you')
    expect(markup).not.toMatch(LEAK)
  })

  it('surfaces when a point sits on a juror’s own subject', () => {
    const owned = receptions.filter((item) => item.ownSubject)
    const markup = renderToStaticMarkup(
      <RoomRead summary="" receptions={receptions} profiles={profiles} />,
    )

    if (owned.length > 0) expect(markup).toContain('Their subject')
    expect(markup).not.toMatch(LEAK)
  })
})

describe('RoomRead backfire priority', () => {
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
