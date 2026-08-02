import { describe, expect, it } from 'vitest'
import {
  REASONING_MODELS,
  deliberationPackV5Schema,
  evaluateDeliberationPack,
  type DeliberationPackV5,
} from './deliberationPackV5'

function fixture(): DeliberationPackV5 {
  const issues = Array.from({ length: 25 }, (_, index) => ({
    id: `issue-${index}`,
    label: `Issue concept ${index}`,
    aliases: [`concern number ${index}`, `question point ${index}`],
    elementId: `element-${index % 4}`,
  }))
  const evidence = Array.from({ length: 12 }, (_, index) => ({
    id: `evidence-${index}`,
    label: `Evidence item ${index}`,
    aliases: [`record number ${index}`, `exhibit item ${index}`],
    issueIds: [`issue-${index % 25}`],
    beatIds: [`beat-${index % 12}`],
  }))
  return {
    schema_version: 5,
    case_id: 'dd-0006',
    case_revision: 'dd-0006@1234abcd',
    issues,
    evidence,
    propositions: Array.from({ length: 60 }, (_, index) => ({
      id: `proposition-${index}`,
      label: `Proposition concept ${index}`,
      aliases: [`claim number ${index}`, `inference point ${index}`],
      issueId: `issue-${index % 25}`,
      position: index % 2 ? 'G' as const : 'NG' as const,
      evidenceIds: [`evidence-${index % 12}`],
    })),
    responseMoves: Array.from({ length: 80 }, (_, index) => ({
      id: `response-${index}`,
      issueIds: [`issue-${index % 25}`],
      acts: ['assert' as const],
      positions: ['G' as const, 'NG' as const, 'U' as const],
      text: 'On {issue}, I heard your point. Which part should we test against {evidence}?',
    })),
    reasoning_profiles: REASONING_MODELS.map((reasoning_model, index) => ({
      seat: index + 1,
      reasoning_model,
      display_name: `Juror ${index + 1}`,
      baseline_position: index < 5 ? 'G' as const : index < 10 ? 'NG' as const : 'U' as const,
      element_weights: { [`element-${index % 4}`]: (index - 5) / 12 },
      change_threshold: 0.4 + index / 100,
      question_style: ['direct', 'curious', 'careful', 'probing'][index % 4] as
        'direct' | 'curious' | 'careful' | 'probing',
    })),
    utterance_tests: Array.from({ length: 150 }, (_, index) => ({
      id: `utterance-${index}`,
      input: `Issue concept ${index % 25} concerns me.`,
      expected: {
        issue_id: `issue-${index % 25}`,
        act: 'assert' as const,
        evidence_ids: [],
        position: 'U' as const,
        needs_clarification: false,
      },
    })),
  }
}

describe('Deliberation V5 authored pack', () => {
  it('enforces production-scale content and 12 distinct reasoning models', () => {
    const parsed = deliberationPackV5Schema.parse(fixture())
    expect(parsed.issues).toHaveLength(25)
    expect(parsed.propositions).toHaveLength(60)
    expect(parsed.responseMoves).toHaveLength(80)
    expect(new Set(parsed.reasoning_profiles.map(({ reasoning_model }) => reasoning_model)).size)
      .toBe(12)
    expect(parsed.utterance_tests).toHaveLength(150)
  })

  it('rejects dangling references and duplicated belief models', () => {
    const broken = fixture()
    broken.propositions[0].evidenceIds = ['evidence-missing']
    broken.reasoning_profiles[1].reasoning_model =
      broken.reasoning_profiles[0].reasoning_model
    const result = deliberationPackV5Schema.safeParse(broken)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          'unknown reference: evidence-missing',
          'all 12 reasoning models must be distinct',
        ]),
      )
    }
  })

  it('measures the agreed non-AI interaction quality gates', () => {
    const metrics = evaluateDeliberationPack(fixture())
    expect(metrics).toEqual({
      understoodWithinOneClarification: 1,
      confidentMisinterpretation: 0,
      relevantReply: 1,
      repeatedMove: 0,
      passes: true,
    })
  })

  it('fails a confidently mislabelled utterance corpus', () => {
    const broken = fixture()
    for (let index = 0; index < 10; index++) {
      broken.utterance_tests[index].expected.issue_id = 'issue-24'
    }
    const metrics = evaluateDeliberationPack(broken)
    expect(metrics.confidentMisinterpretation).toBeGreaterThan(0.05)
    expect(metrics.passes).toBe(false)
  })
})
