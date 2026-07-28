import { describe, expect, it } from 'vitest'
import { caseStorageId } from './caseRevision'
import {
  docketCaseAnalysisV4Schema,
  docketCaseSchema,
  docketCaseSchemaForPromptVersion,
  docketCaseV4Schema,
  parseDocketCaseForPromptVersion,
  type DocketCaseV4,
} from './caseSchema'
import { makeDocketCase } from './fixtures'
import { checkV4EditorialBundle, legalSheetSchema } from './legalSheetSchema'

function makeV4Case(): DocketCaseV4 {
  const raw = structuredClone(makeDocketCase()) as unknown as Record<string, unknown>
  delete raw.verdict_truth
  delete raw.twist
  delete (raw.accused as Record<string, unknown>).if_guilty
  for (const beat of raw.beats as Array<Record<string, unknown>>) {
    delete beat.true_weight
    delete beat.reveal_stamp
    delete beat.reveal_note
  }
  ;(raw.gen_meta as Record<string, unknown>).prompt_version = 'dd-2026-v4'
  return docketCaseV4Schema.parse(raw)
}

function makeBundle(trial: DocketCaseV4) {
  const revision = caseStorageId(trial)
  const analysis = docketCaseAnalysisV4Schema.parse({
    schema_version: 4,
    case_id: trial.id,
    case_revision: revision,
    reference_verdict: 'Not Guilty',
    reference_reasoning: 'The prosecution did not exclude the alternative.',
    strongest_opposing_interpretation: 'The combined records still support knowledge.',
    sentencing_context: 'Sentencing would be determined by the judge.',
    beats: trial.beats.map((beat, index) => ({
      beat_id: beat.id,
      editorial_weight: index === 0 ? 0.8 : 0.4,
      analysis_role: index === 0 ? 'central' : 'context',
      analysis_note: 'A qualified editorial assessment.',
    })),
  })
  const approval = {
    status: 'approved',
    reviewer: 'Named reviewer',
    approved_at: '2026-07-29T00:00:00.000Z',
    content_hash: revision,
  }
  const sheet = legalSheetSchema.parse({
    schema_version: 1,
    case_id: trial.id,
    case_revision: revision,
    jurisdiction: 'State of Orinth',
    statute: {
      name: 'Orinth Criminal Code 2026',
      section: 's 10',
      elements: trial.elements,
    },
    agreed_facts: ['The material event occurred.'],
    disputed_facts: ['The accused’s knowledge remains disputed.'],
    best_case: {
      prosecution: 'The records support the required inference.',
      defence: 'The records leave a reasonable alternative.',
    },
    foundations: [{
      beat_id: trial.beats[0].id,
      provenance: 'The custodian identified the record.',
      authentication: 'The custodian explained its creation.',
      custody_and_integrity: 'The audit trail remained intact.',
      admissibility: 'The fictional statute permits the record.',
      limitations: 'It does not identify the accused by itself.',
    }],
    alternative_innocent_inference: 'Another authorised user created the record.',
    required_directions: ['Apply the criminal standard to every element.'],
    epilogue_strategy: 'result_branched',
    checks: {
      victim_humanity: 'The affected person is treated as a person.',
      accused_prejudice: 'Irrelevant punishment is excluded.',
    },
    approvals: { legal: approval, read_aloud: approval, blind_test: approval },
  })
  return { analysis, sheet }
}

describe('Docket Case V4 editorial contract', () => {
  it('routes strict V4 while retaining V3 and the fiction pin', () => {
    const trial = makeV4Case()
    expect(docketCaseSchemaForPromptVersion(trial)).toBe(docketCaseV4Schema)
    expect(docketCaseSchemaForPromptVersion(makeDocketCase())).toBe(docketCaseSchema)
    expect(parseDocketCaseForPromptVersion(trial)).toEqual(trial)
    expect(trial.label).toBe('fiction')
  })

  it('rejects legacy answer-key and punishment fields', () => {
    const trial = makeV4Case()
    const oldBeat = {
      ...trial.beats[0],
      true_weight: 0.9,
      reveal_stamp: 'decisive',
      reveal_note: 'An answer-key explanation.',
    }
    for (const legacy of [
      { verdict_truth: 'Guilty' },
      { twist: 'A completed answer.' },
      { accused: { ...trial.accused, if_guilty: 'Pre-verdict punishment.' } },
      { beats: [oldBeat, ...trial.beats.slice(1)] },
    ]) {
      expect(docketCaseV4Schema.safeParse({ ...trial, ...legacy }).success).toBe(false)
    }
  })

  it('validates isolated analysis and a hash-bound legal sheet', () => {
    const trial = makeV4Case()
    const { analysis, sheet } = makeBundle(trial)
    expect(checkV4EditorialBundle(trial, analysis, sheet)).toEqual([])
    expect(docketCaseAnalysisV4Schema.safeParse({
      ...analysis,
      verdict_truth: 'Not Guilty',
    }).success).toBe(false)

    analysis.beats.pop()
    sheet.approvals.legal.content_hash = 'stale'
    sheet.foundations.push(sheet.foundations[0])
    expect(checkV4EditorialBundle(trial, analysis, sheet)).toEqual(expect.arrayContaining([
      'legal approval is stale',
      'post-verdict analysis must cover every playable beat exactly once',
      `foundation lists beat '${trial.beats[0].id}' more than once`,
    ]))
  })
})
