import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
    expect(markup).toContain('Export progress')
  })
})
