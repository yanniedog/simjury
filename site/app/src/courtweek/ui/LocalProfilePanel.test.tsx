// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PROFILE_SCHEMA_VERSION, type LocalProfile } from '../state/localProfile'
import { LocalProfilePanel } from './LocalProfilePanel'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const baseProfile: LocalProfile = {
  schemaVersion: LOCAL_PROFILE_SCHEMA_VERSION,
  jurorLabel: 'Juror 01',
  adultFictionAcknowledged: true,
}

describe('LocalProfilePanel', () => {
  const roots: ReturnType<typeof createRoot>[] = []
  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('contains only public, on-device profile settings', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const onChange = vi.fn()
    await act(async () => root.render(<LocalProfilePanel
      profile={baseProfile}
      persistence="local-storage"
      issue={null}
      onChange={onChange}
      onReset={vi.fn()}
    />))

    expect(container.textContent).toContain('No account')
    expect(container.textContent).not.toMatch(/developer|all-session preview/iu)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reopens when an external reset clears the adult acknowledgement', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const props = {
      persistence: 'local-storage' as const,
      issue: null,
      onChange: vi.fn(),
      onReset: vi.fn(),
    }
    await act(async () => root.render(<LocalProfilePanel profile={baseProfile} {...props} />))
    expect(container.querySelector('details')?.open).toBe(false)

    await act(async () => root.render(<LocalProfilePanel
      profile={{ ...baseProfile, adultFictionAcknowledged: false }}
      {...props}
    />))
    expect(container.querySelector('details')?.open).toBe(true)
  })
})
