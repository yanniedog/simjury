// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REASONING_MODELS } from '../../engine/deliberationPackV5'
import type { ClientDeliberationPack } from '../../lib/v2/caseBundles'
import type { DocketCaseV4 } from '../../lib/v2/caseSchema'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { v4CourtroomCompatibilityIssue } from '../../lib/v2/v4CourtroomCompatibility'
import { caseStorageId } from '../../lib/v2/caseRevision'
import { completePlay, saveProgress } from '../../lib/storage'
import type { DocketSittingV4 } from '../../lib/v2/cases'
import { V4DocketApp, V4JuryRoomUnavailable, V4LazyBoundary } from './V4DocketApp'

const roots: Root[] = []
const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
reactGlobal.IS_REACT_ACT_ENVIRONMENT = true

function trial(): DocketCaseV4 {
  return makeDocketCase() as unknown as DocketCaseV4
}

function pack(caseId: string, revision: string): ClientDeliberationPack {
  return {
    schema_version: 5,
    case_id: caseId,
    case_revision: revision,
    issues: [], evidence: [], propositions: [], responseMoves: [],
    reasoning_profiles: REASONING_MODELS.map((reasoning_model, index) => ({
      seat: index + 1,
      reasoning_model,
      display_name: index ? `Juror ${index + 1}` : 'You',
      baseline_position: 'U',
      element_weights: {},
      change_threshold: 0.5,
      question_style: 'careful',
    })),
  }
}

function mount(sitting: DocketSittingV4) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(
    <V4DocketApp
      sitting={sitting}
      sittings={[sitting]}
      featuredSitting={sitting}
      onSelect={vi.fn()}
      intro={null}
    />,
  ))
  return container
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.textContent = ''
})

describe('V4 jury-room boundary', () => {
  it('stops explicitly instead of substituting the V3 room or revealing an answer', () => {
    const markup = renderToStaticMarkup(<V4JuryRoomUnavailable status="ready" />)

    expect(markup).toContain('new authored jury-room format')
    expect(markup).toContain('will not substitute the older hidden-weight room')
    expect(markup).not.toMatch(/reference verdict|guilty|not guilty/i)
  })

  it('fails closed before an authored interjection can be silently omitted', () => {
    const trial = {
      id: 'dd-v4-guard',
      beats: [{
        id: 'b1',
        interjections: [{ id: 'obj-1' }],
      }],
    } as unknown as Pick<DocketCaseV4, 'id' | 'beats'>

    expect(v4CourtroomCompatibilityIssue(trial)).toBe(
      'V4 case dd-v4-guard cannot open safely: beat b1 contains courtroom interjections, but the ordered player is not installed.',
    )
    expect(v4CourtroomCompatibilityIssue({
      ...trial,
      beats: [{ ...trial.beats[0], interjections: [] }],
    })).toBeNull()
  })

  it('offers an accessible retry without exposing later case material', () => {
    const retry = vi.fn()
    const markup = renderToStaticMarkup(
      <V4LazyBoundary label="verdict analysis" status="error" onRetry={retry} />,
    )
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Try again')
    expect(markup).toContain('Nothing later in the case has been exposed')
  })

  it('loads the deliberation pack only on jury-room resume', async () => {
    const current = trial()
    const revision = caseStorageId(current)
    saveProgress({ day: 19, caseId: revision, phase: 'juryroom', beatIndex: 0 })
    const loadDeliberationPack = vi.fn(async () => pack(current.id, revision))
    const loadPostVerdict = vi.fn()
    const sitting = {
      day: 19,
      date: new Date('2026-08-01T00:00:00Z'),
      schemaVersion: 4,
      trial: current,
      loadDeliberationPack,
      loadPostVerdict,
    } satisfies DocketSittingV4

    const container = mount(sitting)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(loadDeliberationPack).toHaveBeenCalledOnce()
    expect(loadPostVerdict).not.toHaveBeenCalled()
    expect(container.textContent).toContain("This case's 12-person jury")
  })

  it('loads post-verdict analysis on sealed-result resume, never before', async () => {
    const current = trial()
    const revision = caseStorageId(current)
    completePlay({
      day: 20,
      caseId: revision,
      convictions: [],
      verdict: 'Not Guilty',
      room: { kind: 'majority', verdict: 'not_guilty', g: 1, ng: 11, u: 0 },
    })
    const loadDeliberationPack = vi.fn()
    const loadPostVerdict = vi.fn(async () => ({ analysis: {
      schema_version: 4 as const,
      case_id: current.id,
      case_revision: revision,
      reference_verdict: 'Not Guilty' as const,
      reference_reasoning: 'The record left a reasonable alternative.',
      strongest_opposing_interpretation: 'The combined records still supported knowledge.',
      sentencing_context: 'Sentencing would follow only after conviction.',
      epilogue: { mode: 'result_branched' as const, guilty: 'Guilty branch.', not_guilty: 'Not guilty branch.', hung: 'Hung branch.' },
      beats: current.beats.map((beat) => ({
        beat_id: beat.id,
        editorial_weight: 0.5,
        analysis_role: 'context' as const,
        analysis_note: 'This beat had to be weighed with its stated limitation.',
      })),
    } }))
    const sitting = {
      day: 20,
      date: new Date('2026-08-02T00:00:00Z'),
      schemaVersion: 4,
      trial: current,
      loadDeliberationPack,
      loadPostVerdict,
    } satisfies DocketSittingV4

    const container = mount(sitting)
    expect(loadPostVerdict).toHaveBeenCalledOnce()
    expect(loadDeliberationPack).not.toHaveBeenCalled()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.textContent).toContain('Why the authors resolved it that way')
    expect(container.textContent).toContain('The combined records still supported knowledge.')
    expect(container.textContent).toContain('Beat-by-beat analysis')
    expect(container.textContent).toContain('Sentencing would follow only after conviction.')
    expect(container.textContent).toContain('Not guilty branch.')
    expect(container.textContent).not.toMatch(/agreed facts|disputed facts|approval/i)
  })
})
