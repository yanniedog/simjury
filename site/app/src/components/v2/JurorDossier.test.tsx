// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { jurorProfiles } from '../../engine/jurorProfile'
import { startPersuasion } from '../../engine/persuasion'
import { themeLabel } from '../../lib/themeCopy'
import type { SittingNote } from '../../lib/jurorNotes'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { JuryDossierPanel } from './JurorDossier'

const trial = makeDocketCase()
const profiles = jurorProfiles(trial.jury.jurors)
const relations = startPersuasion(profiles.map(({ id }) => id)).byJuror
const first = profiles[0]
const notes: SittingNote[] = [{
  ownerId: first.id,
  beatId: trial.beats[0].id,
  text: 'Watch the timestamp gap.',
}]

/** Anything a leaning or tally would look like in player-visible copy. */
const LEAK = /guilty|not guilty|undecided|acquit|convict|\b\d+\s*[-–]\s*\d+\b/i

function panel(expandedId: string | null = first.id) {
  return (
    <JuryDossierPanel
      trial={trial}
      profiles={profiles}
      relations={relations}
      tells={{ [first.id]: 'leaned forward' }}
      notes={notes}
      expandedId={expandedId}
      onExpand={() => undefined}
    />
  )
}

describe('JuryDossierPanel', () => {
  it('shows authored juror detail and reviewed theme labels', () => {
    const markup = renderToStaticMarkup(panel())
    const focus = first.caresAbout[0]

    expect(markup).toContain(first.label)
    expect(markup).toContain(first.persona)
    expect(markup).toContain('How to reach them')
    expect(markup).toContain('Where you stand')
    expect(markup).toContain('Watch the timestamp gap.')
    expect(markup).toContain('leaned forward')
    if (focus) {
      expect(markup).toContain(themeLabel(focus))
      expect(markup).not.toContain(`>${focus}<`)
    }
  })

  it('does not expose evidence, reveal copy, a leaning, or a tally', () => {
    const markup = renderToStaticMarkup(panel())

    expect(markup).not.toContain(trial.beats[0].text)
    expect(markup).not.toContain(trial.beats[0].reveal_note)
    expect(markup).not.toMatch(LEAK)
  })

  it('opens one controlled dossier at a time and closes it on a second press', () => {
    function ControlledPanel() {
      const [expandedId, setExpandedId] = useState<string | null>(null)
      return (
        <JuryDossierPanel
          trial={trial}
          profiles={profiles}
          relations={relations}
          tells={{}}
          notes={[]}
          expandedId={expandedId}
          onExpand={setExpandedId}
        />
      )
    }

    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      act(() => root.render(<ControlledPanel />))
      const buttons = [...container.querySelectorAll<HTMLButtonElement>('.dossier-head')]
      const firstPanel = container.querySelector<HTMLElement>(`#${buttons[0].getAttribute('aria-controls')}`)
      const secondPanel = container.querySelector<HTMLElement>(`#${buttons[1].getAttribute('aria-controls')}`)

      expect(buttons).toHaveLength(11)
      expect(buttons[0].getAttribute('aria-expanded')).toBe('false')
      expect(firstPanel?.hidden).toBe(true)

      act(() => buttons[0].click())
      expect(buttons[0].getAttribute('aria-expanded')).toBe('true')
      expect(firstPanel?.hidden).toBe(false)

      act(() => buttons[1].click())
      expect(buttons[0].getAttribute('aria-expanded')).toBe('false')
      expect(firstPanel?.hidden).toBe(true)
      expect(buttons[1].getAttribute('aria-expanded')).toBe('true')
      expect(secondPanel?.hidden).toBe(false)

      act(() => buttons[1].click())
      expect(buttons[1].getAttribute('aria-expanded')).toBe('false')
      expect(secondPanel?.hidden).toBe(true)
    } finally {
      act(() => root.unmount())
    }
  })
})
