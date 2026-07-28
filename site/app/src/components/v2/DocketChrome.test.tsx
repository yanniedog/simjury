import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocketShell } from './DocketChrome'

function writableStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

describe('DocketShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the case skip link and a labelled narration control', () => {
    vi.stubGlobal('window', {
      speechSynthesis: {
        getVoices: () => [
          { name: 'Desktop English', lang: 'en-US', localService: true },
        ],
      },
    })
    vi.stubGlobal('localStorage', writableStorage())
    const markup = renderToStaticMarkup(
      <DocketShell
        phase="beats"
        caseTitle="The Quiet Platform"
        dayNumber={12}
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">Case briefing</h1>
      </DocketShell>,
    )

    expect(markup).toContain('href="#phase-heading"')
    expect(markup).toContain('aria-label="Narration speed"')
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('Case briefing')
    expect(markup).not.toContain('aria-current="step"')
    expect(markup).toContain('Saved only in this browser')
    expect(markup).toContain('There is no sync')
    expect(markup).toContain('clearing site data')
    expect(markup).toContain('href="/privacy/"')
    expect(markup).not.toContain('will not resume')
  })

  it('exposes experimental voice mode when a change handler is provided', () => {
    vi.stubGlobal('window', {
      speechSynthesis: {
        getVoices: () => [
          { name: 'Desktop English', lang: 'en-US', localService: true },
        ],
      },
    })
    vi.stubGlobal('localStorage', writableStorage())
    const markup = renderToStaticMarkup(
      <DocketShell
        phase="beats"
        caseTitle="The Quiet Platform"
        narration={true}
        playbackRate={1}
        voiceEngine="kokoro"
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
        onVoiceEngineChange={() => undefined}
      >
        <h1 id="phase-heading">Case briefing</h1>
      </DocketShell>,
    )
    expect(markup).toContain('aria-label="Narration voice mode"')
    expect(markup).toContain('Experimental')
    expect(markup).toContain('Default')
  })

  it('warns without blocking the sitting when browser storage rejects writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => undefined,
    })

    const markup = renderToStaticMarkup(
      <DocketShell
        phase="intro"
        caseTitle="The Quiet Platform"
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">Case briefing</h1>
      </DocketShell>,
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Storage is unavailable')
    expect(markup).toContain('This sitting will not resume after closing')
    expect(markup).toContain('Case briefing')
  })
})

