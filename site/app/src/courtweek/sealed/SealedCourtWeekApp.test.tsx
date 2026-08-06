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
      developerMode: false,
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

  it('hydrates all seven packs only after explicit local developer preview and leaves saved progress untouched', async () => {
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
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    expect(container.querySelector('input[type="password"]')).toBeNull()
    const developerToggle = Array.from(container.querySelectorAll('label')).find(
      ({ textContent }) => textContent?.includes('Developer mode'),
    )?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!developerToggle) throw new Error('Developer mode toggle was not rendered.')
    expect(fetcher).not.toHaveBeenCalled()
    await act(async () => developerToggle.click())
    expect(fetcher).not.toHaveBeenCalled()
    const openPreview = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Open all-session preview',
    )
    await act(async () => openPreview?.click())
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(7))
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

    act(() => window.dispatchEvent(new Event('pagehide')))
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    await expect(loadWeeklyProgress(existing.courtWeekId)).resolves.toMatchObject({ notes: existing.notes })
  })

  it('does not expose preview or request future packs from the retired developer hash', async () => {
    const hydrate = vi.spyOn(loader, 'hydrateCourtPacks')
    history.replaceState(null, '', '/jury/#developer')
    await act(async () => root.render(<SealedCourtWeekApp bootstrap={courtWeekBootstrap} />))
    await vi.waitFor(() => expect(container.textContent).toContain('Take your seat'))
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.textContent).not.toContain('DEV PREVIEW')
    expect(hydrate).not.toHaveBeenCalled()
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
