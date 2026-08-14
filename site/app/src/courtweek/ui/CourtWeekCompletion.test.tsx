// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { elevenMinutesSessions } from '../content'
import { CourtWeekCompletion } from './CourtWeekCompletion'

describe('CourtWeekCompletion', () => {
  it('offers every completed session for replay and explains sealed-state safety', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        sessions={elevenMinutesSessions}
        persistence="indexeddb"
        onReplay={() => undefined}
        onSettings={() => undefined}
      />,
    )

    expect(markup.match(/Replay (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/g)).toHaveLength(7)
    expect(markup).toContain('sealed ballots or returned result')
    expect(markup).not.toContain('Progress is held in this tab only')
  })

  it('warns when completion relies on memory-only persistence', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        sessions={elevenMinutesSessions}
        persistence="memory"
        onReplay={() => undefined}
        onSettings={() => undefined}
        onExportProgress={() => undefined}
      />,
    )

    expect(markup).toContain('Progress is held in this tab only')
    expect(markup).toContain('Include my private notes in the export')
    expect(markup).not.toContain('checked=""')
    expect(markup).toContain('Export progress')
  })

  it('keeps session switching and exit available after a preview completes', () => {
    const markup = renderToStaticMarkup(
      <CourtWeekCompletion
        sessions={elevenMinutesSessions}
        persistence="ephemeral"
        onReplay={() => undefined}
        onSettings={() => undefined}
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
        sessions={elevenMinutesSessions}
        persistence="ephemeral"
        onReplay={() => undefined}
        onSettings={() => undefined}
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
