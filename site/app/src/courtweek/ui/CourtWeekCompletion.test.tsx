// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek, elevenMinutesSessions } from '../content'
import type { StoredWeeklyProgress } from '../state/progress'
import { CourtWeekCompletion } from './CourtWeekCompletion'

const reasoning = elevenMinutesCourtWeek.deliberation.propositions.find(
  ({ id }) => id === 'prop-causation-window-doubt',
)!
const completeProgress: StoredWeeklyProgress = {
  schemaVersion: 'court-week-progress-v1',
  courtWeekId: 'cw-0001',
  revision: elevenMinutesCourtWeek.manifest.revision,
  highestObservedTime: '2026-08-17T09:00:00+10:00',
  completedSessionIds: elevenMinutesSessions.map(({ id }) => id),
  notes: 'Private causation note.',
  returnedVerdict: 'not-guilty',
  returnedAgreement: 'unanimous',
  reasoningContributions: [{
    propositionId: reasoning.id,
    sceneId: 'sat-causation',
    legalQuestion: reasoning.legalQuestion,
    evidenceId: 'ex-survival',
    move: 'challenge-inference',
    recordedAt: '2026-08-15T11:00:00+10:00',
    influencePenalty: 0,
  }],
}
const recordProps = {
  sessions: elevenMinutesSessions,
  progress: completeProgress,
  deliberation: elevenMinutesCourtWeek.deliberation,
  evidence: elevenMinutesCourtWeek.trial.evidence,
  onReplay: () => undefined,
  onSettings: () => undefined,
}

describe('CourtWeekCompletion', () => {
  it('offers every completed session for replay and explains sealed-state safety', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        {...recordProps}
        persistence="indexeddb"
        onExportProgress={() => undefined}
      />,
    )

    expect(markup.match(/Replay (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/g)).toHaveLength(7)
    expect(markup).toContain('Private completion record')
    expect(markup).toContain('Not Guilty')
    expect(markup).toContain('Unanimous')
    expect(markup).toContain('Strongest lawful rationale')
    expect(markup).toContain('Strongest counter-reading')
    expect(markup).toContain('Challenge an inference')
    expect(markup).not.toContain('challenge-inference')
    expect(markup).not.toMatch(/correct answer|score|celebrat|morally/i)
    expect(markup).not.toContain('Progress is held in this tab only')
    expect(markup).toContain('Export progress')
  })

  it('warns when completion relies on memory-only persistence', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        {...recordProps}
        persistence="memory"
        onExportProgress={() => undefined}
      />,
    )

    expect(markup).toContain('Progress is held in this tab only')
    expect(markup).toContain('Include my private notes in the export')
    expect(markup).not.toContain('checked=""')
    expect(markup).toContain('Export progress')
  })

  it('exports persistent progress without private notes until the juror opts in', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onExportProgress = vi.fn()
    await act(async () => root.render(
      <CourtWeekCompletion {...recordProps} persistence="indexeddb" onExportProgress={onExportProgress} />,
    ))

    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    const exportButton = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Export progress',
    )!
    await act(async () => exportButton.click())
    await act(async () => checkbox.click())
    await act(async () => exportButton.click())

    expect(onExportProgress.mock.calls).toEqual([[false], [true]])
    act(() => root.unmount())
    container.remove()
  })

  it('keeps session switching and exit available after a preview completes', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        {...recordProps}
        persistence="ephemeral"
        testSession={{
          selectedOrdinal: 7,
          sessions: elevenMinutesSessions,
          onSelect: () => undefined,
          onLeave: () => undefined,
        }}
      />,
    )

    expect(markup).toContain('Test session')
    expect(markup).toContain('Sunday test complete')
    expect(markup).not.toContain('Court Week complete')
    expect(markup).toContain('Leave test session')
    expect(markup).toContain('Temporary progress and private notes are discarded')
    expect(markup).toContain('<option value="7" selected="">Sunday</option>')
  })

  it('invokes preview session switching and exit controls', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onSelect = vi.fn()
    const onLeave = vi.fn()
    await act(async () => root.render(
      <CourtWeekCompletion
        {...recordProps}
        persistence="ephemeral"
        testSession={{
          selectedOrdinal: 1,
          sessions: elevenMinutesSessions,
          onSelect,
          onLeave,
        }}
      />,
    ))

    const selector = container.querySelector<HTMLSelectElement>('#cw-developer-day-complete')
    if (!selector) throw new Error('Developer completion selector was not rendered.')
    selector.value = '7'
    act(() => selector.dispatchEvent(new Event('change', { bubbles: true })))
    const leave = Array.from(container.querySelectorAll('button')).find(
      ({ textContent }) => textContent?.trim() === 'Leave test session',
    )
    act(() => leave?.click())

    expect(onSelect).toHaveBeenCalledWith(7)
    expect(onLeave).toHaveBeenCalledOnce()
    act(() => root.unmount())
    container.remove()
  })
})
