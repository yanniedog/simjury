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
      developerMode: true,
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


  it('opens all-session preview automatically when the temporary developer default is already acknowledged', async () => {
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.spyOn(loader, 'hydrateCourtPacks').mockImplementation(async ({
      entries,
      fetcher: load,
    }) => {
      await Promise.all(entries.map(({ locator }) => load?.(`/packs/${locator}`)))
      return packs
    })
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap} packBase="/packs/" fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('DEV PREVIEW'))
    expect(fetcher).toHaveBeenCalledTimes(7)
  })

  it('migrates a stored developerMode:false profile into automatic all-session preview', async () => {
    saveLocalProfile({
      jurorLabel: 'Juror 01',
      adultFictionAcknowledged: true,
      developerMode: false,
    })
    const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.spyOn(loader, 'hydrateCourtPacks').mockImplementation(async ({
      entries,
      fetcher: load,
    }) => {
      await Promise.all(entries.map(({ locator }) => load?.(`/packs/${locator}`)))
      return packs
    })
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap} packBase="/packs/" fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(container.textContent).toContain('DEV PREVIEW'))
    expect(fetcher).toHaveBeenCalledTimes(7)
    expect(JSON.parse(localStorage.getItem('simjury:court-week:local-profile:v1') ?? '{}'))
      .toMatchObject({ developerMode: true })
  })

  it('hydrates all seven packs in the temporary default preview and leaves saved progress untouched', async () => {
    const existing: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1', courtWeekId: courtWeekBootstrap.id,
      revision: courtWeekBootstrap.revision, highestObservedTime: '2026-08-06T08:31:00.000Z',
      completedSessionIds: [], currentSessionId: courtWeekBootstrap.sessions[0].id,
      notes: 'Keep this saved note.', reasoningContributions: [], majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(existing.courtWeekId, existing)
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
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
      return packs
    })
    await act(async () => root.render(<SealedCourtWeekApp
      bootstrap={courtWeekBootstrap} packBase="/packs/" fetcher={fetcher}
    />))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(7))
    expect(container.querySelector('input[type="password"]')).toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(
      container.querySelector('#cw-developer-day'),
    ))
    expect(container.textContent).toContain('Saved juror progress is untouched')
    expect(container.textContent).toContain('Preview progress and private notes are discarded')
    expect(container.textContent).not.toContain('progress remains on this device')

    const selector = container.querySelector<HTMLSelectElement>('#cw-developer-day')
    if (!selector) throw new Error('Developer day selector was not rendered.')
    selector.value = '7'
    await act(async () => selector.dispatchEvent(new Event('change', { bubbles: true })))
    const reading = container.querySelector<HTMLInputElement>('input[value="reading"]')
    if (reading) await act(async () => reading.click())
    const enter = Array.from(container.querySelectorAll('button')).find(({ textContent }) => textContent?.trim() === 'Take your seat')
    await act(async () => enter?.click())
    expect(container.textContent).toContain('Sunday')
    expect(container.textContent).toContain('DEV preview')

    const previewControls = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'DEV preview',
    )
    await act(async () => previewControls?.click())
    const modalSelector = container.querySelector<HTMLSelectElement>('#cw-developer-day-modal')
    if (!modalSelector) throw new Error('Developer modal selector was not rendered.')
    modalSelector.value = '6'
    await act(async () => modalSelector.dispatchEvent(new Event('change', { bubbles: true })))
    await vi.waitFor(() => expect(document.activeElement).toBe(
      container.querySelector('#cw-developer-day'),
    ))

    const leave = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Leave preview',
    )
    await act(async () => leave?.click())
    await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector('h1')))
    expect(container.textContent).not.toContain('DEV PREVIEW')
    expect(container.textContent).toContain('Court opens Monday')

    act(() => window.dispatchEvent(new Event('pagehide')))
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    await expect(loadWeeklyProgress(existing.courtWeekId)).resolves.toMatchObject({ notes: existing.notes })
  })

  it('does not treat the retired developer hash as authentication', async () => {
    history.replaceState(null, '', '/jury/#developer')
    await act(async () => root.render(<SealedCourtWeekApp bootstrap={courtWeekBootstrap} />))
    // Temporary default opens preview from the local profile, not from #developer.
    await vi.waitFor(() => expect(container.textContent).toMatch(/Developer preview|DEV PREVIEW/))
    expect(container.querySelector('input[type="password"]')).toBeNull()
    await leaveDeveloperPreview()
    expect(container.textContent).toContain('Court opens Monday')
    expect(container.textContent).not.toMatch(/Developer preview|DEV PREVIEW/)
  })

  it('keeps the entry usable while today’s sealed session opens', async () => {
    // Public sealed loading must not wait on all-session preview hydration.
    // Leave-preview is available on the loading state; leave immediately so this
    // case exercises StandardSealedCourtWeekApp (temporary default opens preview).
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
    await leaveDeveloperPreview()
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
    await leaveDeveloperPreview()
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
    await leaveDeveloperPreview()
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    const click = async (label: string) => {
      const button = Array.from(container.querySelectorAll('button')).find(
        (candidate) => candidate.textContent?.trim() === label,
      )
      if (!button) throw new Error(`Button not found: ${label}`)
      await act(async () => button.click())
    }
    await click('Take your seat')
    await click('Continue')
    await click('Continue')

    expect(container.textContent).toContain('Legal question')
    expect(container.textContent).toContain('Admitted evidence')
    expect(container.textContent).toContain('connect')
    expect(container.textContent).not.toContain(elevenMinutesCourtWeek.deliberation.jurors[0].occupation)
  })
})
