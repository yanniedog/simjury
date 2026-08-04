// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  clearMemoryProgressForTests,
  saveWeeklyProgress,
  type StoredWeeklyProgress,
} from '../state/progress'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'
import { clearOpenedPackMemoryForTests, saveOpenedPack } from './packStore'
import { SealedCourtWeekApp } from './SealedCourtWeekApp'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('SealedCourtWeekApp', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    clearMemoryProgressForTests()
    clearOpenedPackMemoryForTests()
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
    vi.restoreAllMocks()
  })

  it('opens Monday while the Saturday deliberation pack remains absent', async () => {
    const mondayPack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]
    expect(mondayPack.deliberation).toBeUndefined()
    await saveOpenedPack(mondayPack)

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
    await Promise.all(packs.slice(0, 5).map((pack) => saveOpenedPack(pack)))
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
