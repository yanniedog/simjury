// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  clearMemoryProgressForTests,
  loadWeeklyProgress,
  saveWeeklyProgress,
  type StoredWeeklyProgress,
} from '../state/progress'
import { WEEKLY_PROGRESS_EVENT } from '../state/useWeeklyProgress'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'
import { clearOpenedPackMemoryForTests, saveOpenedPack } from './packStore'
import { SealedCourtWeekApp } from './SealedCourtWeekApp'
import * as loader from './loader'
import {
  clearMemoryLocalProfileForTests,
  saveLocalProfile,
} from '../state/localProfile'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const okFetcher = async (..._args: Parameters<typeof fetch>) => {
  void _args
  return new Response('{}', { status: 200 })
}

describe('SealedCourtWeekApp', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    history.replaceState(null, '', '/')
    clearMemoryProgressForTests()
    clearOpenedPackMemoryForTests()
    clearMemoryLocalProfileForTests()
    localStorage.clear()
    saveLocalProfile({
      jurorLabel: 'Juror 01',
      adultFictionAcknowledged: true,
    })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    clearMemoryProgressForTests()
    clearOpenedPackMemoryForTests()
    clearMemoryLocalProfileForTests()
    localStorage.clear()
    vi.restoreAllMocks()
    history.replaceState(null, '', '/')
  })

  async function leaveDeveloperPreview(): Promise<void> {
    await vi.waitFor(() => {
      const leave = Array.from(container.querySelectorAll('button')).find(
        ({ textContent }) => textContent?.trim() === 'Leave preview',
      )
      expect(leave, 'Leave preview control was not rendered.').toBeTruthy()
    })
    const leave = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Leave preview',
    )
    if (!leave) throw new Error('Leave preview control was not rendered.')
    await act(async () => leave.click())
    await vi.waitFor(() => {
      const stillLeaving = Array.from(container.querySelectorAll('button')).some(
        ({ textContent }) => textContent?.trim() === 'Leave preview',
      )
      expect(stillLeaving).toBe(false)
    })
  }

  it('opens one preview pack only on the exact test-build route', async () => {
    history.replaceState(null, '', '/__court-week-preview')
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    const fetcher = vi.fn(okFetcher)
    vi.spyOn(loader, 'hydrateCourtPacks').mockImplementation(async ({
      entries,
      fetcher: load,
    }) => {
      await Promise.all(entries.map(({ locator }) => load?.(`/packs/${locator}`)))
      return packs.filter(({ ordinal }) => entries.some((entry) => entry.ordinal === ordinal))
    })
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap} packBase="/packs/" fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(container.querySelectorAll('.cw-preview-grid select')).toHaveLength(7))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`/packs/${courtWeekBootstrap.sessions[0].locator}`)
    await leaveDeveloperPreview()
  })

  it('ignores and strips a retired public developer preference', async () => {
    localStorage.setItem('simjury:court-week:local-profile:v1', JSON.stringify({
      schemaVersion: 'simjury-local-profile-v1',
      jurorLabel: 'Juror 01',
      adultFictionAcknowledged: true,
      developerMode: true,
    }))
    const fetcher = vi.fn(okFetcher)
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      now={() => Date.parse('2026-08-10T08:29:59+10:00')}
      packBase="/packs/"
      fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('Court opens Monday'))
    expect(container.textContent).not.toMatch(/Developer preview|DEV PREVIEW/u)
    expect(fetcher).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('simjury:court-week:local-profile:v1') ?? '{}'))
      .not.toHaveProperty('developerMode')
  })

  it('keeps route-preview state ephemeral and leaves saved progress untouched', async () => {
    history.replaceState(null, '', '/__court-week-preview')
    const existing: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1', courtWeekId: courtWeekBootstrap.id,
      revision: courtWeekBootstrap.revision, highestObservedTime: '2026-08-06T08:31:00.000Z',
      completedSessionIds: [], currentSessionId: courtWeekBootstrap.sessions[0].id,
      notes: 'Keep this saved note.', reasoningContributions: [], majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(existing.courtWeekId, existing)
    const fetcher = vi.fn(okFetcher)
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    vi.spyOn(loader, 'hydrateCourtPacks').mockImplementation(async ({
      entries,
      fetcher: load,
      persistOpened,
      readOpened,
    }) => {
      expect(persistOpened).toBe(false)
      expect(readOpened).toBe(false)
      await Promise.all(entries.map(({ locator }) => load?.(`/packs/${locator}`)))
      if (entries[0]?.ordinal === 6) throw new Error('Isolated pack failure')
      return packs.filter(({ ordinal }) => entries.some((entry) => entry.ordinal === ordinal))
    })
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      now={() => Date.parse('2026-08-10T08:29:59+10:00')}
      packBase="/packs/"
      fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`/packs/${courtWeekBootstrap.sessions[0].locator}`)
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.textContent).toContain('Saved progress is untouched')
    expect(container.textContent).toContain('Temporary progress and private notes are discarded')
    expect(container.textContent).not.toContain('progress remains on this device')

    const selector = container.querySelector<HTMLSelectElement>('#cw-preview-day')
    if (!selector) throw new Error('Developer day selector was not rendered.')
    selector.value = '7'
    await act(async () => selector.dispatchEvent(new Event('change', { bubbles: true })))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(`/packs/${courtWeekBootstrap.sessions[6].locator}`)
    const reading = container.querySelector<HTMLInputElement>('input[value="reading"]')
    if (reading) await act(async () => reading.click())
    const enter = Array.from(container.querySelectorAll('button')).find(({ textContent }) => textContent?.trim() === 'Take your seat')
    await act(async () => enter?.click())
    expect(container.textContent).toContain('Sunday')
    expect(container.textContent).toContain('COURT WEEK PREVIEW')
    const presentation = container.querySelector<HTMLSelectElement>('.cw-presentation-mode select')
    expect(presentation?.value).toBe('reading')
    if (presentation) presentation.value = 'captions'
    await act(async () => presentation?.dispatchEvent(new Event('change', { bubbles: true })))
    const previewAccess = Array.from(container.querySelectorAll<HTMLSelectElement>('.cw-preview-grid select'))
      .find((control) => control.parentElement?.textContent?.startsWith('Access'))
    expect(previewAccess?.value).toBe('captions')

    const previewControls = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Test session',
    )
    await act(async () => previewControls?.click())
    const modalSelector = container.querySelector<HTMLSelectElement>('#cw-developer-day-modal')
    if (!modalSelector) throw new Error('Developer modal selector was not rendered.')
    modalSelector.value = '6'
    await act(async () => modalSelector.dispatchEvent(new Event('change', { bubbles: true })))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    expect(String(fetcher.mock.calls[2]?.[0])).toBe(`/packs/${courtWeekBootstrap.sessions[5].locator}`)
    await vi.waitFor(() => expect(container.textContent).toContain('Other days remain available'))
    const recoveredSelector = container.querySelector<HTMLSelectElement>('#cw-preview-day')!
    recoveredSelector.value = '5'
    await act(async () => recoveredSelector.dispatchEvent(new Event('change', { bubbles: true })))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
    expect(String(fetcher.mock.calls[3]?.[0])).toBe(`/packs/${courtWeekBootstrap.sessions[4].locator}`)
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    expect(container.querySelector<HTMLInputElement>('input[value="captions"]')?.checked).toBe(true)
    expect(previewAccess?.value).toBe('captions')

    const leave = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Leave preview',
    )
    await act(async () => leave?.click())
    await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector('h1')))
    expect(container.textContent).not.toContain('COURT WEEK PREVIEW')
    expect(container.textContent).toContain('Court opens Monday')

    act(() => window.dispatchEvent(new Event('pagehide')))
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    await expect(loadWeeklyProgress(existing.courtWeekId, existing.revision)).resolves.toMatchObject({ notes: existing.notes })
  })

  it('does not treat the retired developer hash as authentication', async () => {
    history.replaceState(null, '', '/jury/#developer')
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      now={() => Date.parse('2026-08-10T08:29:59+10:00')}
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('Court opens Monday'))
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.textContent).not.toMatch(/Developer preview|DEV PREVIEW/)
  })

  it('keeps the entry usable while today’s sealed session opens', async () => {
    const now = Date.parse('2026-08-10T08:31:00+10:00')
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: courtWeekBootstrap.id,
      revision: courtWeekBootstrap.revision,
      highestObservedTime: new Date(now).toISOString(),
      completedSessionIds: [],
      currentSessionId: courtWeekBootstrap.sessions[0].id,
      notes: '',
      reasoningContributions: [],
      majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)
    const mondayPack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]
    let finishLoading: ((packs: (typeof mondayPack)[]) => void) | undefined
    const loadEligiblePacks = vi.spyOn(loader, 'loadEligibleCourtPacks').mockImplementation(() => new Promise((resolve) => {
      finishLoading = resolve
    }))

    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      now={() => now}
      packBase="/packs/"
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('Opening today’s court session'))
    expect(container.querySelector('main')?.getAttribute('aria-busy')).toBe('true')
    expect(container.textContent).toContain('Eleven Minutes')
    expect(container.textContent).toContain('Experience settings')
    expect(container.textContent).not.toContain('Take your seat')
    expect(loadEligiblePacks).toHaveBeenCalledTimes(1)

    await act(async () => window.dispatchEvent(new CustomEvent<StoredWeeklyProgress>(
      WEEKLY_PROGRESS_EVENT,
      { detail: { ...progress, completedSessionIds: [...progress.completedSessionIds] } },
    )))
    expect(loadEligiblePacks).toHaveBeenCalledTimes(1)

    await act(async () => window.dispatchEvent(new CustomEvent<StoredWeeklyProgress>(
      WEEKLY_PROGRESS_EVENT,
      { detail: { ...progress, notes: 'A real progress change with the same eligible session.' } },
    )))
    expect(loadEligiblePacks).toHaveBeenCalledTimes(1)

    await act(async () => finishLoading?.([mondayPack]))
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    expect(container.querySelector('main')?.hasAttribute('aria-busy')).toBe(false)
    expect(loadEligiblePacks).toHaveBeenCalledTimes(1)
  })

  it('opens Monday while the Saturday deliberation pack remains absent', async () => {
    const mondayPack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]
    expect(mondayPack.deliberation).toBeUndefined()
    await saveOpenedPack(mondayPack, courtWeekBootstrap.releaseTag)

    const now = Date.parse('2026-08-10T08:31:00+10:00')
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: courtWeekBootstrap.id,
      revision: courtWeekBootstrap.revision,
      highestObservedTime: new Date(now).toISOString(),
      completedSessionIds: [],
      currentSessionId: courtWeekBootstrap.sessions[0].id,
      notes: '',
      reasoningContributions: [],
      majorityDirectionReceived: false,
      accessibilityMode: 'reading',
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)

    await act(async () => {
      root.render(
        <SealedCourtWeekApp
          bootstrap={courtWeekBootstrap}
          now={() => now}
          releaseBase="/media"
          packBase="/packs/"
        />,
      )
    })
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    expect(courtWeekBootstrap.contentAdvisory).toBe(elevenMinutesCourtWeek.manifest.contentAdvisory)
    expect(container.textContent).toContain('acted distress call')
    expect(container.textContent).toContain('Pause or leave at any time')

    const enter = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Take your seat',
    )
    await act(async () => enter?.click())

    expect(container.textContent).toContain('Monday')
    expect(container.textContent).toContain('Members of the jury panel')
    expect(container.textContent).not.toContain(
      elevenMinutesCourtWeek.deliberation.improperArguments[0].claim,
    )
  })

  it('keeps required Friday reflections playable without opening the Saturday deliberation pack', async () => {
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    await Promise.all(packs.slice(0, 5).map((pack) => saveOpenedPack(pack, courtWeekBootstrap.releaseTag)))
    expect(packs[4].deliberation).toBeUndefined()

    const now = Date.parse('2026-08-14T08:31:00+10:00')
    const friday = elevenMinutesCourtWeek.manifest.sessions[4]
    await saveWeeklyProgress(courtWeekBootstrap.id, {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: courtWeekBootstrap.id,
      revision: courtWeekBootstrap.revision,
      highestObservedTime: new Date(now).toISOString(),
      completedSessionIds: courtWeekBootstrap.sessions.slice(0, 4).map(({ id }) => id),
      currentSessionId: friday.id,
      currentSceneId: 'fri-crown-close',
      currentCueId: 'fri-crown-closing-1',
      notes: '',
      reasoningContributions: [],
      majorityDirectionReceived: false,
      accessibilityMode: 'reading',
    })

    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      now={() => now}
      releaseBase="/media"
      packBase="/packs/"
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    const click = async (label: string) => {
      const exact = Array.from(container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label,
      )
      const button = exact ?? (label === 'Take your seat'
        ? container.querySelector<HTMLButtonElement>('.cw-entry__primary')
        : null)
      if (!button) throw new Error(`Button not found: ${label}`)
      await act(async () => button.click())
    }
    const advance = async () => {
      const button = container.querySelector<HTMLButtonElement>('.cw-controls__advance')
      if (!button) throw new Error('Court advance action not found')
      await act(async () => button.click())
    }
    await click('Take your seat')
    await advance()
    await advance()

    expect(container.textContent).toContain('Legal question')
    expect(container.textContent).toContain('Admitted evidence')
    expect(container.textContent).toContain('connect')
    expect(container.querySelector('.cw-primary')?.textContent).toContain('Continue without saving reflection')
    expect(container.textContent).not.toContain(elevenMinutesCourtWeek.deliberation.jurors[0].occupation)
  })
})
