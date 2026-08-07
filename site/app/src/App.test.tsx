import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'
import { elevenMinutesCourtWeek } from './courtweek/content'

describe('Court Week application entry', () => {
  it('ships Eleven Minutes as the only active courtroom experience', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(elevenMinutesCourtWeek.manifest.title).toBe('Eleven Minutes')
    expect(elevenMinutesCourtWeek.manifest.sessions).toHaveLength(7)
    expect(markup).toContain('Preparing your place in court')
    expect(markup).not.toContain('Daily Docket')
    expect(markup).not.toContain('case library')
    expect(markup).not.toContain('live jury')
  })
})
