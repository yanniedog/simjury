import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { docketLibrarySittings, featuredDocketSitting, introSitting } from '../../lib/v2/cases'
import { saveProgress } from '../../lib/storage'
import { caseStorageId } from '../../lib/v2/caseRevision'
import { DocketShell, DocketSittingChooser } from './DocketChrome'

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

  it('quiets phase progress and the empty sidebar in entry mode', () => {
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
        phase="intro"
        caseTitle="Guided intro"
        entryMode
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">Start with a guided intro?</h1>
      </DocketShell>,
    )

    expect(markup).toContain('docket-entry')
    expect(markup).toContain('Start with a guided intro?')
    expect(markup).not.toContain('role="progressbar"')
    expect(markup).not.toContain('Juror docket')
    expect(markup).not.toContain('Saved only in this browser')
  })

  it('can hide narration controls on the age gate', () => {
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
        phase="intro"
        caseTitle="SimJury"
        entryMode
        hideNarration
        narration={false}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">A fictional courtroom for adults</h1>
      </DocketShell>,
    )

    expect(markup).not.toContain('aria-label="Toggle narration"')
    expect(markup).not.toContain('narration-controls')
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

describe('DocketSittingChooser', () => {
  it('offers exactly seven unique commissioned cases', () => {
    vi.stubGlobal('localStorage', writableStorage())
    const sittings = docketLibrarySittings()
    const intro = introSitting()
    const featured = featuredDocketSitting(new Date(2026, 6, 29))
    saveProgress({
      day: featured!.day,
      caseId: caseStorageId(featured!.trial),
      phase: 'beats',
      beatIndex: 0,
    })
    const markup = renderToStaticMarkup(
      <DocketSittingChooser
        sittings={sittings}
        selectedCaseId={featured!.trial.id}
        featuredSitting={featured}
        onSelect={() => undefined}
        introSitting={intro}
      />,
    )

    expect(markup).toContain('Case library')
    expect(markup).toContain('Choose one of 7 cases')
    expect(markup.match(/<option/g)).toHaveLength(7)
    expect(new Set(
      [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    )).toHaveLength(7)
    // 2026-07-29 opens no case of its own, so the docket re-serves the one
    // filed on the 28th. Calling that "Today" told a returning player it was
    // new; the label carries the real filing date instead.
    // The whole filing date is asserted, not just the prefix: `new Date(iso)`
    // parses a publish date as UTC midnight, so a zone west of UTC rendered the
    // day before — a case filed on the 28th showed as filed on the 27th.
    expect(markup).toContain('Today’s sitting, filed Tue, 28 July — The Alibi That Spoke')
    expect(markup).not.toContain('27 July')
    expect(markup).not.toContain('Today — The Alibi That Spoke')
    for (const trial of [intro!.trial, ...sittings.map(({ trial }) => trial)]) {
      expect(markup).toContain(trial.title)
    }
  })

  it('says plainly "Today" when a case was actually filed today', () => {
    vi.stubGlobal('localStorage', writableStorage())
    const sittings = docketLibrarySittings()
    // 2026-07-28 is a publish date, so this is genuinely today's case.
    const featured = featuredDocketSitting(new Date(2026, 6, 28))
    const markup = renderToStaticMarkup(
      <DocketSittingChooser
        sittings={sittings}
        selectedCaseId={featured!.trial.id}
        featuredSitting={featured}
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Today — The Alibi That Spoke')
    expect(markup).not.toContain('filed')
  })
})

