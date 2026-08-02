import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { docketLibrarySittings, featuredDocketSitting, introSitting, type DocketSitting } from '../../lib/v2/cases'
import { saveProgress } from '../../lib/storage'
import { caseStorageId } from '../../lib/v2/caseRevision'
import { DocketShell, DocketSittingChooser, dateFormatter } from './DocketChrome'

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

  it('offers a separate, explicit courtroom ambience control', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', writableStorage())
    const markup = renderToStaticMarkup(
      <DocketShell
        phase="juryroom"
        caseTitle="The Quiet Platform"
        narration={false}
        ambience={true}
        playbackRate={1}
        onToggleNarration={() => undefined}
        onToggleAmbience={() => undefined}
        onRateChange={() => undefined}
      >
        <h1 id="phase-heading">Jury room</h1>
      </DocketShell>,
    )

    expect(markup).toContain('aria-label="Toggle courtroom ambience"')
    expect(markup).toContain('Room tone on')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).not.toContain('aria-label="Narration speed"')
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
  it('caps the library at seven dated cases and keeps the intro separate', () => {
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
    const expectedCount = Math.min(sittings.length, 7)
    const optionIds = [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1])
    expect(markup).toContain(`Choose one of ${expectedCount} cases`)
    expect(optionIds).toHaveLength(expectedCount)
    expect(new Set(optionIds)).toHaveLength(expectedCount)
    expect(optionIds).not.toContain('dd-intro')
    expect(markup).toContain('class="docket-intro-link"')
    expect(markup).toContain('Today — The Alibi That Spoke (in progress)')
    expect(markup).toContain(intro!.trial.title)
    for (const trial of sittings.slice(-7).map(({ trial }) => trial)) {
      expect(markup).toContain(trial.title)
    }
  })

  it('shows only the seven newest dated cases when retained provenance grows', () => {
    vi.stubGlobal('localStorage', writableStorage())
    const sittings = docketLibrarySittings()
    const seed = sittings.find((sitting) => sitting.schemaVersion === 3)!
    const additions = [1, 2].map((sequence) => ({
      ...seed,
      day: 100 + sequence,
      date: new Date(`2026-09-0${sequence}T00:00:00.000Z`),
      trial: {
        ...seed.trial,
        id: `dd-cap-${sequence}`,
        publish_date: `2026-09-0${sequence}`,
        title: `Cap case ${sequence}`,
      },
    } satisfies DocketSitting))
    const growingCorpus = [...sittings, ...additions]
    const markup = renderToStaticMarkup(
      <DocketSittingChooser
        sittings={growingCorpus}
        selectedCaseId={additions[1].trial.id}
        featuredSitting={null}
        onSelect={() => undefined}
        introSitting={introSitting()}
      />,
    )
    const optionIds = [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1])
    const expectedIds = [...growingCorpus]
      .sort((left, right) => left.trial.publish_date.localeCompare(right.trial.publish_date)
        || left.trial.id.localeCompare(right.trial.id))
      .slice(-7)
      .reverse()
      .map(({ trial }) => trial.id)

    expect(optionIds).toEqual(expectedIds)
    expect(optionIds).toHaveLength(7)
    expect(optionIds).not.toContain(growingCorpus[0].trial.id)
  })
})

describe('library dates', () => {
  it('formats sitting dates in UTC, so they do not shift for a viewer west of it', () => {
    // #302 made the daily boundary UTC, so `utcDateFromIso` builds a publish
    // date as UTC midnight. Rendering that in the viewer's own zone showed the
    // day before to everyone west of UTC — a case published 2026-08-05 read
    // "Tue, 4 Aug" in Los Angeles.
    //
    // The zone has to be asserted on the formatter itself. This suite runs east
    // of UTC, where a UTC-midnight date renders as the same day either way, so
    // comparing rendered output here would pass with or without the fix.
    expect(dateFormatter.resolvedOptions().timeZone).toBe('UTC')

    const published = new Date('2026-08-05T00:00:00.000Z')
    expect(dateFormatter.format(published)).toContain('5')

    // The zones genuinely disagree for this date, which is what made it a bug.
    const losAngeles = new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Los_Angeles',
    }).format(published)
    expect(losAngeles).toContain('4')
    expect(losAngeles).not.toEqual(dateFormatter.format(published))
  })
})
