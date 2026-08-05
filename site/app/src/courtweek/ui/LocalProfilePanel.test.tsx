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
  developerMode: false,
}

describe('LocalProfilePanel', () => {
  const roots: ReturnType<typeof createRoot>[] = []
  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
  })

  it('keeps future-session loading behind an explicit developer action', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const onChange = vi.fn()
    const onOpenDeveloperPreview = vi.fn()
    await act(async () => root.render(<LocalProfilePanel
      profile={baseProfile}
      persistence="local-storage"
      issue={null}
      onChange={onChange}
      onReset={vi.fn()}
      onOpenDeveloperPreview={onOpenDeveloperPreview}
    />))

    expect(container.textContent).toContain('No account')
    expect(container.textContent).not.toContain('Open all-session preview')
    const developer = Array.from(container.querySelectorAll('label')).find(
      ({ textContent }) => textContent?.includes('Developer mode'),
    )?.querySelector<HTMLInputElement>('input')
    await act(async () => developer?.click())
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ developerMode: true }))
    expect(onOpenDeveloperPreview).not.toHaveBeenCalled()
  })

  it('shows the spoiler action only for an enabled local profile', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const onOpenDeveloperPreview = vi.fn()
    await act(async () => root.render(<LocalProfilePanel
      profile={{ ...baseProfile, adultFictionAcknowledged: true, developerMode: true }}
      persistence="local-storage"
      issue={null}
      onChange={vi.fn()}
      onReset={vi.fn()}
      onOpenDeveloperPreview={onOpenDeveloperPreview}
    />))
    const open = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent === 'Open all-session preview',
    )
    await act(async () => open?.click())
    expect(onOpenDeveloperPreview).toHaveBeenCalledOnce()
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
      onOpenDeveloperPreview: vi.fn(),
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
