import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { elevenMinutesTrialRecord } from '../content/trialRecord'
import { EvidenceViewer } from './EvidenceViewer'
import { REVIEWED_EXHIBIT_PRESENTATIONS } from './evidencePresentation'

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
    expect(Object.keys(REVIEWED_EXHIBIT_PRESENTATIONS).sort()).toEqual([...reviewedIds].sort())
    for (const id of reviewedIds) {
      const presentation = REVIEWED_EXHIBIT_PRESENTATIONS[id]
      expect(presentation.alt.length).toBeGreaterThan(70)
      expect(presentation.ambiguity.length).toBeGreaterThan(50)
      expect(presentation.id).toBe(id)
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

  it('preserves the critical competing propositions in visible renderings', () => {
    const markup = reviewedIds.map((id) =>
      renderToStaticMarkup(REVIEWED_EXHIBIT_PRESENTATIONS[id].rendering),
    ).join('\n')
    expect(markup).toContain('Actions are recorded; reasons and state of mind are not.')
    expect(markup).toContain('has no recorded time')
    expect(markup).toContain('READY does not mean free from maintenance warnings')
    expect(markup).toContain('did not ground Kestrel')
    expect(markup).toContain('cannot be said to guarantee survival')
  })
})

