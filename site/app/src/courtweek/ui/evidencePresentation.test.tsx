import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { elevenMinutesTrialRecord } from '../content/trialRecord'
import { EvidenceViewer } from './EvidenceViewer'
import { renderExhibitPresentation } from './evidencePresentation'

const reviewedIds = [
  'ex-route',
  'ex-audit-log',
  'ex-launch-strip',
  'ex-ready-display',
  'ex-warning',
  'ex-survival',
] as const

describe('reviewed exhibit presentations', () => {
  it('defines exactly the six requested admitted renderings with ambiguity in their alternatives', () => {
    const presented = elevenMinutesTrialRecord.evidence.filter((item) => item.presentation)
    expect(presented.map((item) => item.id).sort()).toEqual([...reviewedIds].sort())
    for (const id of reviewedIds) {
      const presentation = presented.find((item) => item.id === id)?.presentation
      expect(presentation).toBeDefined()
      expect(presentation!.alt.length).toBeGreaterThan(70)
      expect(presentation!.ambiguity.length).toBeGreaterThan(50)
    }
  })

  it('renders every exhibit as scalable structured markup with its evidence foundation and limitations', () => {
    for (const id of reviewedIds) {
      const evidence = elevenMinutesTrialRecord.evidence.find((item) => item.id === id)
      expect(evidence).toBeDefined()
      const markup = renderToStaticMarkup(<EvidenceViewer evidence={evidence!} onClose={() => undefined} />)
      expect(markup).toContain('cw-exhibit')
      expect(markup).toContain('Evidence foundation')
      expect(markup).toContain('How you may use it')
      expect(markup).toContain('Limitations')
      expect(markup).toContain(evidence!.provenance)
      expect(markup).toContain(evidence!.limitations[0])
      expect(markup).not.toContain('aria-hidden="true"')
      expect(markup).not.toContain('struck-rumour')
      expect(markup).not.toContain('Struck workplace rumour')
    }
  })

  it('fails closed without exposing struck content when called directly', () => {
    const struck = elevenMinutesTrialRecord.evidence.find((item) => item.status === 'struck')
    expect(struck).toBeDefined()
    const markup = renderToStaticMarkup(<EvidenceViewer evidence={struck!} onClose={() => undefined} />)
    expect(markup).toContain('Exhibit unavailable')
    expect(markup).not.toContain(struck!.label)
    expect(markup).not.toContain(struck!.provenance)
    expect(markup).not.toContain(struck!.accessibleProposition)
  })

  it('uses a neutral built-in surface when an admitted exhibit has no visual facsimile', () => {
    const recording = elevenMinutesTrialRecord.evidence.find((item) => item.id === 'ex-distress')
    expect(recording).toBeDefined()
    const markup = renderToStaticMarkup(<EvidenceViewer evidence={recording!} onClose={() => undefined} />)
    expect(markup).toContain('data-visual-fallback="neutral"')
    expect(markup).toContain('A visual facsimile is unavailable. The admitted proposition remains available.')
    expect(markup).toContain(recording!.accessibleProposition)
    expect(markup).toContain(recording!.allowedUses[0])
    expect(markup).toContain(recording!.limitations[0])
  })

  it('preserves the critical competing propositions in visible renderings', () => {
    const markup = elevenMinutesTrialRecord.evidence.flatMap((item) => item.presentation
      ? [renderToStaticMarkup(renderExhibitPresentation(item.presentation))]
      : []).join('\n')
    expect(markup).toContain('Actions are recorded; reasons and state of mind are not.')
    expect(markup).toContain('has no recorded time')
    expect(markup).toContain('READY does not mean free from maintenance warnings')
    expect(markup).toContain('did not ground Kestrel')
    expect(markup).toContain('cannot be said to guarantee survival')
  })

  it('exposes every structured visual field to assistive technology', () => {
    const strings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value]
      if (Array.isArray(value)) return value.flatMap(strings)
      if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
      return []
    }
    for (const evidence of elevenMinutesTrialRecord.evidence.filter((item) => item.presentation)) {
      const markup = renderToStaticMarkup(<EvidenceViewer evidence={evidence} onClose={() => undefined} />)
      const { alt: _alt, kind: _kind, ...visibleAndDescribed } = evidence.presentation!
      void _alt
      void _kind
      for (const value of strings(visibleAndDescribed)) expect(markup).toContain(value)
    }
  })
})
