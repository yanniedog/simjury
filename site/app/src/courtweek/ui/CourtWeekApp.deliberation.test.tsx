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

  it('observes a moving court clock without feeding progress updates back into rendering', async () => {
    const monday = elevenMinutesCourtWeek.manifest.sessions[0]
    const firstScene = monday?.scenes[0]
    const firstCue = firstScene?.cues[0]
    if (!monday || !firstScene || !firstCue) throw new Error('Monday fixtures are missing.')
    const persistedTime = '2026-08-10T08:30:00+10:00'
    await saveWeeklyProgress(elevenMinutesCourtWeek.manifest.id, {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: elevenMinutesCourtWeek.manifest.id,
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: persistedTime,
      completedSessionIds: [],
      currentSessionId: monday.id,
      currentSceneId: firstScene.id,
      currentCueId: firstCue.id,
      notes: '',
      accessibilityMode: 'reading',
      majorityDirectionReceived: false,
    })
    let clockReads = 0
    const start = Date.parse('2026-08-17T09:00:00+10:00')
    const now = () => start + clockReads++
    const errors: unknown[][] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args) })

    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={now} releaseBase="/media" />)
      await Promise.resolve()
    })

    const saved = await act(async () => vi.waitFor(async () => {
      const candidate = await loadWeeklyProgress(elevenMinutesCourtWeek.manifest.id)
      expect(Date.parse(candidate?.highestObservedTime ?? '')).toBeGreaterThan(Date.parse(persistedTime))
      return candidate
    }, { timeout: 1_000, interval: 20 }))
    expect(Date.parse(saved?.highestObservedTime ?? '')).toBeGreaterThan(Date.parse(persistedTime))
    expect(Date.parse(saved?.highestObservedTime ?? '')).toBeGreaterThanOrEqual(start)
    expect(clockReads).toBeLessThan(10)
    expect(errors.some((args) => args.some((value) => String(value).includes('Maximum update depth')))).toBe(false)
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

  it('freezes cue playback and legal position until a mandatory interaction is completed', async () => {
    const courtWeek = structuredClone(elevenMinutesCourtWeek)
    const monday = courtWeek.manifest.sessions[0]
    const scene = monday.scenes[0]
    const cue = scene.cues.at(-1)!
    cue.audio = {
      opus: '/media/mandatory-interaction.opus',
      mp3: '/media/mandatory-interaction.mp3',
      segmentId: 'mandatory-interaction',
      startSeconds: 0,
      endSeconds: 12,
    }
    monday.scenes[1].cues[0].audio = {
      opus: '/media/after-mandatory-interaction.opus',
      mp3: '/media/after-mandatory-interaction.mp3',
      segmentId: 'after-mandatory-interaction',
      startSeconds: 0,
      endSeconds: 12,
    }
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1', courtWeekId: 'cw-0001',
      revision: courtWeek.manifest.revision,
      highestObservedTime: '2026-08-10T12:00:00+10:00', completedSessionIds: [],
      currentSessionId: monday.id, currentSceneId: scene.id, currentCueId: cue.id,
      notes: '', reasoningContributions: [], accessibilityMode: 'audio-first', majorityDirectionReceived: false,
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)
    let latestProgress = progress
    const onProgress = (event: Event) => {
      latestProgress = (event as CustomEvent<StoredWeeklyProgress>).detail
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
    let clock = Date.parse('2026-08-10T12:00:00+10:00')
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)
    let beginPlaying: (() => void) | undefined
    let finishPlaying: (() => void) | undefined
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      finishPlaying = () => {
        Object.defineProperty(this, 'ended', { configurable: true, value: true })
        this.dispatchEvent(new Event('ended'))
        this.dispatchEvent(new Event('ended'))
      }
      return new Promise<void>((resolve) => {
        beginPlaying = () => {
          this.dispatchEvent(new Event('playing'))
          resolve()
        }
      })
    })

    await act(async () => {
      root.render(<CourtWeekApp courtWeek={courtWeek} now={() => clock} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    expect(play).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.cw-stage')?.getAttribute('aria-busy')).toBe('true')
    await act(async () => clickButton(container, 'Juror desk'))
    expect(pause).toHaveBeenCalled()
    await act(async () => clickButton(container, 'Close'))
    expect(play).toHaveBeenCalledTimes(2)
    await act(async () => beginPlaying?.())
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Pause')).toBe(true)
    pause.mockClear()
    await act(async () => {
      if (!finishPlaying) throw new Error('The active recorded cue was not created.')
      finishPlaying()
    })
    expect(container.querySelector('.cw-interaction')).not.toBeNull()
    expect(pause).toHaveBeenCalled()

    const frozen = { sceneId: latestProgress.currentSceneId, cueId: latestProgress.currentCueId }
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      clock += 120_000
      window.dispatchEvent(new Event('focus'))
    })
    expect({ sceneId: latestProgress.currentSceneId, cueId: latestProgress.currentCueId }).toEqual(frozen)

    await act(async () => clickButton(container, 'Juror desk'))
    await act(async () => clickButton(container, 'Close'))
    expect(container.querySelector('.cw-interaction')).not.toBeNull()

    const choice = container.querySelector<HTMLButtonElement>('.cw-choice-grid button')!
    await act(async () => choice.click())
    await act(async () => clickButton(container, 'Continue proceedings'))
    expect(play).toHaveBeenCalledTimes(3)
    expect(latestProgress).toMatchObject({ currentSceneId: 'mon-oath', currentCueId: 'mon-oath' })
    expect(container.querySelector('.cw-interaction')).toBeNull()
    expect(container.querySelector('.cw-cue-live-region')?.textContent).toContain('Choose an oath or affirmation')
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
  })

  it('publishes the sealed result only after the open-court return cue is traversed', async () => {
    const sunday = elevenMinutesCourtWeek.manifest.sessions[6]
    const verdictScene = sunday.scenes.find(({ id }) => id === 'sun-verdict')!
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: '2026-08-16T12:00:00+10:00',
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.slice(0, 6).map(({ id }) => id),
      currentSessionId: sunday.id,
      currentSceneId: verdictScene.id,
      currentCueId: 'sun-verdict-return',
      notes: '',
      provisionalVote: 'unable-to-agree',
      secondVote: 'unable-to-agree',
      finalVote: 'unable-to-agree',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: true,
      sealedVerdict: 'unable-to-agree',
      sealedAgreement: 'hung',
      openCourtVerdictReturned: false,
      accessibilityMode: 'reading',
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)
    let latestProgress = progress
    const onProgress = (event: Event) => {
      latestProgress = (event as CustomEvent<StoredWeeklyProgress>).detail
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, onProgress)

    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={() => Date.parse('2026-08-16T12:00:00+10:00')} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    expect(container.textContent).toContain('The accused stands')
    expect(latestProgress.openCourtVerdictReturned).toBe(false)
    expect(latestProgress.returnedVerdict).toBeUndefined()

    await act(async () => clickButton(container, 'Continue'))
    expect(latestProgress).toMatchObject({
      currentCueId: 'sun-verdict-confirm',
      openCourtVerdictReturned: true,
      returnedVerdict: 'unable-to-agree',
      returnedAgreement: 'hung',
    })
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
  })

  it('records the majority direction only after the judge delivers it', async () => {
    const sunday = elevenMinutesCourtWeek.manifest.sessions[6]
    const majorityScene = sunday.scenes.find(({ id }) => id === 'sun-majority')!
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: '2026-08-16T12:00:00+10:00',
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.slice(0, 6).map(({ id }) => id),
      currentSessionId: sunday.id,
      currentSceneId: majorityScene.id,
      currentCueId: 'sun-majority-direction',
      notes: '',
      provisionalVote: 'unable-to-agree',
      secondVote: 'unable-to-agree',
      secondBallotWasUnanimous: false,
      majorityDirectionReceived: false,
      accessibilityMode: 'reading',
    }
    await saveWeeklyProgress(progress.courtWeekId, progress)
    let latestProgress = progress
    const onProgress = (event: Event) => {
      latestProgress = (event as CustomEvent<StoredWeeklyProgress>).detail
    }
    window.addEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={() => Date.parse('2026-08-16T12:00:00+10:00')} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    expect(latestProgress.majorityDirectionReceived).toBe(false)
    await act(async () => clickButton(container, 'Continue'))
    expect(latestProgress).toMatchObject({
      currentCueId: 'sun-majority-limit',
      majorityDirectionReceived: true,
    })
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
  })

  it('locks the second ballot before revealing its aggregate', async () => {
    const sunday = elevenMinutesCourtWeek.manifest.sessions[6]
    const ballotScene = sunday.scenes.find(({ id }) => id === 'sun-second-ballot')!
    const progress: StoredWeeklyProgress = {
      schemaVersion: 'court-week-progress-v1',
      courtWeekId: 'cw-0001',
      revision: elevenMinutesCourtWeek.manifest.revision,
      highestObservedTime: '2026-08-16T12:00:00+10:00',
      completedSessionIds: elevenMinutesCourtWeek.manifest.sessions.slice(0, 6).map(({ id }) => id),
      currentSessionId: sunday.id,
      currentSceneId: ballotScene.id,
      currentCueId: ballotScene.cues.at(-1)?.id,
      notes: '',
      provisionalVote: 'not-guilty',
      reasoningContributions: [],
      majorityDirectionReceived: false,
      accessibilityMode: 'reading',
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
    clock += 140_000
    await act(async () => window.dispatchEvent(new Event('focus')))
    await act(async () => clickButton(container, 'Guilty of murder'))
    await act(async () => clickButton(container, 'Seal ballot'))

    expect(container.querySelector('[aria-label="Anonymous second ballot"]')).not.toBeNull()
    const notGuilty = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Not Guilty',
    ) as HTMLButtonElement | undefined
    expect(notGuilty?.disabled).toBe(true)
    await act(async () => notGuilty?.click())
    expect(latestProgress.secondVote).toBe('murder')

    await act(async () => root.unmount())
    await saveWeeklyProgress(progress.courtWeekId, latestProgress)
    root = createRoot(container)
    await act(async () => {
      root.render(<CourtWeekApp courtWeek={elevenMinutesCourtWeek} now={() => clock} releaseBase="/media" />)
      await Promise.resolve()
    })
    await act(async () => clickButton(container, 'Take your seat'))
    await act(async () => clickButton(container, 'Continue'))
    expect(container.querySelector('[aria-label="Anonymous second ballot"]')).not.toBeNull()
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('.cw-verdict-grid button')).every(
      (button) => button.disabled,
    )).toBe(true)

    await act(async () => clickButton(container, 'Continue deliberation'))
    window.removeEventListener(WEEKLY_PROGRESS_EVENT, onProgress)
    expect(latestProgress.secondVote).toBe('murder')
    expect(latestProgress.currentSceneId).toBe('sun-persevere')
  })
})
