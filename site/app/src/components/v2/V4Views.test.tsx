import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { REASONING_MODELS } from '../../engine/deliberationPackV5'
import type { ClientDeliberationPack } from '../../lib/v2/caseBundles'
import type { DocketCaseAnalysisV4, DocketCaseV4 } from '../../lib/v2/caseSchema'
import { makeDocketCase } from '../../lib/v2/fixtures'
import { V4JuryRoom } from './V4JuryRoom'
import { V4Reveal } from './V4Reveal'

const revision = 'dd-0001@1234abcd'
const trial = makeDocketCase() as unknown as DocketCaseV4
const pack = {
  schema_version: 5,
  case_id: trial.id,
  case_revision: revision,
  issues: [], evidence: [], propositions: [], responseMoves: [],
  reasoning_profiles: REASONING_MODELS.map((reasoning_model, index) => ({
    seat: index + 1,
    reasoning_model,
    display_name: index ? `Juror ${index + 1}` : 'You',
    baseline_position: 'U' as const,
    element_weights: {},
    change_threshold: 0.5,
    question_style: 'careful' as const,
  })),
} satisfies ClientDeliberationPack

const analysis = {
  schema_version: 4,
  case_id: trial.id,
  case_revision: revision,
  reference_verdict: 'Not Guilty',
  reference_reasoning: 'The record left a reasonable alternative.',
  strongest_opposing_interpretation: 'The combined records supported knowledge.',
  sentencing_context: 'Sentencing follows only after conviction.',
  epilogue: {
    mode: 'result_branched',
    guilty: 'Guilty branch.',
    not_guilty: 'Not guilty branch.',
    hung: 'Hung branch.',
  },
  beats: [],
} satisfies DocketCaseAnalysisV4

describe('V4 jury and reveal views', () => {
  it('shows the case-bound 12-person room without a pre-seal tally', () => {
    const markup = renderToStaticMarkup(
      <V4JuryRoom
        trial={trial}
        day={1}
        caseRevision={revision}
        pack={pack}
        onSeal={() => undefined}
      />,
    )
    expect(markup).toContain("This case&#x27;s 12-person jury")
    // Finding 02: the room is twelve people, not twelve rows of "Seat 12:".
    // Each seat carries the name the transcript uses and how that juror is
    // reached; the seat number stays in the accessible caption.
    expect(markup).toContain('aria-label="The twelve jury seats"')
    expect(markup).toContain('Seat 12, Juror 12')
    expect(markup).toContain('jury-seat-name')
    expect(markup).toContain('0/3 discussed')

    // Nothing about position, before the judge reads the result.
    expect(markup).not.toMatch(/\d+ guilty, \d+ not guilty/i)
    expect(markup).not.toContain('jury-seat-mark')
    expect(markup).not.toMatch(/lean-(guilty|not|undecided)/)
  })

  it('renders the complete analysis and result-branched epilogue', () => {
    const markup = renderToStaticMarkup(
      <V4Reveal
        trial={trial}
        analysis={analysis}
        playerVerdict="Not Guilty"
        room={{ kind: 'majority', verdict: 'NG', tally: { g: 1, ng: 11, u: 0 } }}
        dayNumber={2}
        onChooseAnother={() => undefined}
      />,
    )
    expect(markup).toContain('The record left a reasonable alternative.')
    expect(markup).toContain('The combined records supported knowledge.')
    expect(markup).toContain('Sentencing follows only after conviction.')
    expect(markup).toContain('Not guilty branch.')
    expect(markup).not.toMatch(/agreed facts|approval/i)
  })
})
