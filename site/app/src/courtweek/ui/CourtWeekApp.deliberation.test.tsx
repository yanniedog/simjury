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
import { WEEKLY_PROGRESS_EVENT } from '../state/useWeeklyProgress'
import { CourtWeekApp } from './CourtWeekApp'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function clickButton(container: HTMLElement, label: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`Button not found: ${label}`)
  button.click()
}

function chooseSelect(container: HTMLElement, label: string, value: string): void {
  const select = Array.from(container.querySelectorAll('label')).find(
    (candidate) => candidate.textContent?.includes(label),
  )?.querySelector('select')
  if (!select) throw new Error(`Select not found: ${label}`)
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('CourtWeekApp improper-argument interaction', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    clearMemoryProgressForTests()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    clearMemoryProgressForTests()
    vi.restoreAllMocks()
  })

  it('makes the authored claims reachable, announces the correction, and persists reduced influence', async () => {
    const saturday = elevenMinutesCourtWeek.manifest.sessions.find((session) => session.day === 'Saturday')
    const scene = saturday?.scenes.find((candidate) => candidate.id === 'sat-improper')
    const cue = scene?.cues.at(-1)
    if (!saturday || !scene || !cue) throw new Error('Saturday improper-argument scene is missing.')

    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: '2026-08-16T12:00:00+10:00',
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.slice(0, 5).map((session) => session.id),
      currentSessionId: saturday.id,
      currentSceneId: scene.id,
      currentCueId: cue.id,
      notes: '',
      reasoningContributions: [],
      accessibilityMode: 'reading',
      majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)

    let latestProgress = progress
    const onProgress = (event: Event) => {
      latestProgress = (event as CustomEvent<StoredWeeklyProgress>).detail
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
    let clock = Date.parse('2026-08-16T12:00:00+10:00')
    const now = () => clock

    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={now} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    await act(async () => clickButton(container, 'Continue'))
    clock += 120_000
    await act(async () => window.dispatchEvent(new Event('focus')))

    expect(container.textContent).toContain('Rely on the accused’s silence')
    expect(container.textContent).toContain('Consider the likely sentence')
    expect(container.textContent).toContain('Rely on character or material the judge excluded')
    expect(container.textContent).toContain('Use manslaughter as a compromise midpoint')
    for (const improper of elevenMinutesCourtWeek.deliberation.improperArguments) {
      expect(container.textContent).not.toContain(improper.claim)
    }

    const proposition = elevenMinutesCourtWeek.deliberation.propositions.find(({ sceneIds, moves }) => (
      sceneIds.includes('sat-improper') && moves.includes('test-source')
    ))
    const legalQuestion = proposition?.legalQuestion
    const evidenceId = proposition?.evidenceIds[0]
    const move = 'test-source'
    const silenceArgument = elevenMinutesCourtWeek.deliberation.improperArguments[0]
    if (!proposition || !legalQuestion || !evidenceId || !silenceArgument) throw new Error('Required deliberation fixtures are missing.')

    await act(async () => {
      chooseSelect(container, 'Legal question', legalQuestion)
      chooseSelect(container, 'Admitted evidence', evidenceId)
      expect(proposition.moves.length).toBeGreaterThanOrEqual(2)
      proposition.moves.forEach((reviewedMove) => expect(container.textContent).toContain(reviewedMove))
      clickButton(container, move)
      const radio = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="reasoning-basis"]')).find(
        (candidate) => candidate.value === 'improper:0',
      )
      if (!radio) throw new Error('Silence argument is not selectable.')
      radio.click()
    })

    const correction = container.querySelector('.cw-reasoning-correction')
    expect(correction?.textContent).toContain('Juror correction')
    expect(correction?.textContent).toContain(silenceArgument.correction)
    expect(correction?.textContent).toContain('receives no influence')

    await act(async () => clickButton(container, 'Continue proceedings'))
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)

    const saved = latestProgress.reasoningContributions?.at(-1)
    expect(saved).toMatchObject({
      sceneId: 'sat-improper',
      propositionId: proposition.id,
      legalQuestion,
      evidenceId,
      move,
      influencePenalty: silenceArgument.influencePenalty,
    })
    expect(saved).not.toHaveProperty('improperClaim')
  })

  it('lets the juror skip an optional reasoning opportunity without fabricating influence', async () => {
    const saturday = elevenMinutesCourtWeek.manifest.sessions.find((session) => session.day === 'Saturday')
    const scene = saturday?.scenes.find((candidate) => candidate.id === 'sat-room')
    const cue = scene?.cues.at(-1)
    if (!saturday || !scene || !cue) throw new Error('Saturday opening scene is missing.')

    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: '2026-08-16T12:00:00+10:00',
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.slice(0, 5).map((session) => session.id),
      currentSessionId: saturday.id,
      currentSceneId: scene.id,
      currentCueId: cue.id,
      notes: '',
      reasoningContributions: [],
      accessibilityMode: 'reading',
      majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)

    let latestProgress = progress
    const onProgress = (event: Event) => {
      latestProgress = (event as CustomEvent<StoredWeeklyProgress>).detail
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
    let clock = Date.parse('2026-08-16T12:00:00+10:00')

    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={() => clock} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    await act(async () => clickButton(container, 'Continue'))
    clock += 120_000
    await act(async () => window.dispatchEvent(new Event('focus')))

    expect(container.textContent).toContain('Continue without contributing')
    await act(async () => clickButton(container, 'Continue without contributing'))
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)

    expect(latestProgress.reasoningContributions).toEqual([])
    expect(latestProgress.currentSceneId).toBe('sat-concerns')
  })
})
