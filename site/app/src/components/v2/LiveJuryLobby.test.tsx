// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const liveJuryHealth = vi.fn()

vi.mock('../../lib/liveJury', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/liveJury')>()),
  liveJuryHealth: () => liveJuryHealth(),
}))

const { LiveJuryLobby } = await import('./LiveJuryLobby')

/**
 * Finding 01. The lobby rendered a titled, gradient-bordered panel reading
 * "Live rooms aren't open right now" at the top of every phase — an
 * advertisement for a feature the player cannot use, above the case, on all
 * six phases and all fourteen evidence beats.
 *
 * An unavailable feature renders nothing. See docs/DESIGN-PROTOCOL.md rule 1.
 */

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  liveJuryHealth.mockReset()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function renderLobby() {
  await act(async () => {
    root.render(
      <LiveJuryLobby
        caseId="dd-0001"
        caseTitle="The Locked Floor"
        derivationRevision="rev-1"
        session={null}
        onSession={() => undefined}
      />,
    )
  })
}

describe('LiveJuryLobby availability', () => {
  it('renders nothing at all when live rooms are closed', async () => {
    liveJuryHealth.mockResolvedValue({ live_jury_enabled: false, ready: false })
    await renderLobby()

    expect(host.innerHTML).toBe('')
    expect(host.textContent).not.toContain('aren’t open')
  })

  it('renders nothing when the health check itself fails', async () => {
    liveJuryHealth.mockRejectedValue(new Error('offline'))
    await renderLobby()

    expect(host.innerHTML).toBe('')
  })

  it('offers the room only once it is confirmed open', async () => {
    liveJuryHealth.mockResolvedValue({ live_jury_enabled: true, ready: true })
    await renderLobby()

    expect(host.textContent).toContain('Deliberate with real people')
    expect(host.querySelector('.live-lobby')).not.toBeNull()
  })
})
