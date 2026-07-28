import { z } from 'zod'
import {
  planJurorReplies,
  understandContribution,
  type DeliberationLanguagePack,
} from './deliberationLanguageV5'
import type { BeliefState, DialogueAct } from './deliberationV5'
import {
  docketCaseIdSchema,
  docketCaseRevisionSchema,
} from '../lib/v2/caseSchema'

const DIALOGUE_ACTS = [
  'assert', 'agree', 'disagree', 'ask_reason', 'ask_evidence', 'ask_element',
  'challenge_source', 'challenge_inference', 'raise_alternative',
  'connect_evidence', 'distinguish', 'ask_reconcile', 'correct_direction',
  'clarify', 'summarize', 'request_ballot', 'pass',
] as const satisfies readonly DialogueAct[]

export const REASONING_MODELS = [
  'evidence_auditor',
  'narrative_coherence',
  'burden_guardian',
  'alternative_hypothesis',
  'credibility_calibrator',
  'element_mapper',
  'source_skeptic',
  'temporal_reconstructor',
  'group_mediator',
  'devil_advocate',
  'cautious_updater',
  'holistic_synthesizer',
] as const

const id = z.string().regex(/^[a-z][a-z0-9-]*$/)
const concept = z.object({
  id,
  label: z.string().trim().min(3).max(100),
  aliases: z.array(z.string().trim().min(2).max(80)).min(2).max(12),
}).strict()

const issue = concept.extend({
  elementId: id.optional(),
}).strict()

const evidence = concept.extend({
  issueIds: z.array(id).min(1).max(6),
}).strict()

const proposition = concept.extend({
  issueId: id,
  position: z.enum(['G', 'NG', 'U']),
  evidenceIds: z.array(id).max(8),
}).strict()

const responseMove = z.object({
  id,
  issueIds: z.array(id).min(1).max(5),
  acts: z.array(z.enum(DIALOGUE_ACTS)).min(1).max(6),
  positions: z.array(z.enum(['G', 'NG', 'U'])).min(1).max(3),
  text: z.string().trim().min(12).max(280),
}).strict()

const reasoningProfile = z.object({
  seat: z.number().int().min(1).max(12),
  reasoning_model: z.enum(REASONING_MODELS),
  display_name: z.string().trim().min(2).max(60),
  baseline_position: z.enum(['G', 'NG', 'U']),
  element_weights: z.record(id, z.number().min(-1).max(1)),
  change_threshold: z.number().min(0).max(1),
  question_style: z.enum(['direct', 'curious', 'careful', 'probing']),
}).strict()

const utteranceTest = z.object({
  id,
  input: z.string().trim().min(1).max(500),
  clarified_input: z.string().trim().min(1).max(500).optional(),
  expected: z.object({
    issue_id: id.nullable(),
    act: z.enum(DIALOGUE_ACTS).optional(),
    evidence_ids: z.array(id).max(5),
    position: z.enum(['G', 'NG', 'U']).optional(),
    needs_clarification: z.boolean(),
  }).strict(),
}).strict()

export const deliberationPackV5Schema = z.object({
  schema_version: z.literal(5),
  case_id: docketCaseIdSchema,
  case_revision: docketCaseRevisionSchema,
  issues: z.array(issue).min(25).max(40),
  evidence: z.array(evidence).min(12).max(40),
  propositions: z.array(proposition).min(60).max(100),
  responseMoves: z.array(responseMove).min(80).max(150),
  reasoning_profiles: z.array(reasoningProfile).length(12),
  utterance_tests: z.array(utteranceTest).min(150).max(250),
}).strict().superRefine((pack, ctx) => {
  const collect = (
    values: Array<{ id: string }>,
    path: string,
  ): Set<string> => {
    const ids = new Set<string>()
    values.forEach(({ id: value }, index) => {
      if (ids.has(value)) ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate ${path} id: ${value}`,
        path: [path, index, 'id'],
      })
      ids.add(value)
    })
    return ids
  }
  const issueIds = collect(pack.issues, 'issues')
  const evidenceIds = collect(pack.evidence, 'evidence')
  collect(pack.propositions, 'propositions')
  collect(pack.responseMoves, 'responseMoves')
  collect(pack.utterance_tests, 'utterance_tests')

  const checkRefs = (
    refs: string[],
    known: Set<string>,
    path: Array<string | number>,
  ) => refs.forEach((ref, index) => {
    if (!known.has(ref)) ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `unknown reference: ${ref}`,
      path: [...path, index],
    })
  })
  pack.evidence.forEach((item, index) =>
    checkRefs(item.issueIds, issueIds, ['evidence', index, 'issueIds']))
  pack.propositions.forEach((item, index) => {
    checkRefs([item.issueId], issueIds, ['propositions', index, 'issueId'])
    checkRefs(item.evidenceIds, evidenceIds, ['propositions', index, 'evidenceIds'])
  })
  pack.responseMoves.forEach((move, index) =>
    checkRefs(move.issueIds, issueIds, ['responseMoves', index, 'issueIds']))
  pack.utterance_tests.forEach((test, index) => {
    if (test.expected.issue_id) {
      checkRefs([test.expected.issue_id], issueIds, ['utterance_tests', index, 'expected', 'issue_id'])
    }
    checkRefs(test.expected.evidence_ids, evidenceIds, [
      'utterance_tests', index, 'expected', 'evidence_ids',
    ])
  })

  const seats = new Set(pack.reasoning_profiles.map(({ seat }) => seat))
  const models = new Set(pack.reasoning_profiles.map(({ reasoning_model }) => reasoning_model))
  if (seats.size !== 12) ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'reasoning profiles must use every seat exactly once',
    path: ['reasoning_profiles'],
  })
  if (models.size !== 12) ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'all 12 reasoning models must be distinct',
    path: ['reasoning_profiles'],
  })
})

export type DeliberationPackV5 = z.infer<typeof deliberationPackV5Schema>

export interface LanguageGateMetrics {
  understoodWithinOneClarification: number
  confidentMisinterpretation: number
  relevantReply: number
  repeatedMove: number
  passes: boolean
}

function runtimePack(pack: DeliberationPackV5): DeliberationLanguagePack {
  return {
    caseId: pack.case_id,
    issues: pack.issues,
    evidence: pack.evidence,
    propositions: pack.propositions,
    responseMoves: pack.responseMoves,
  }
}

function beliefsFor(pack: DeliberationPackV5): BeliefState[] {
  return pack.reasoning_profiles.map((profile) => ({
    seat: profile.seat,
    position: profile.baseline_position,
    elements: profile.element_weights,
    propositions: {},
  }))
}

export function evaluateDeliberationPack(pack: DeliberationPackV5): LanguageGateMetrics {
  const runtime = runtimePack(pack)
  const beliefs = beliefsFor(pack)
  let understood = 0
  let confidentWrong = 0
  let relevant = 0
  let relevantTotal = 0
  let repeated = 0
  let repeatTotal = 0

  for (const test of pack.utterance_tests) {
    const first = understandContribution(test.input, runtime)
    const result = first.needsClarification && test.clarified_input
      ? understandContribution(test.clarified_input, runtime)
      : first
    const expectedIssue = test.expected.issue_id
    const issueCorrect = expectedIssue === null
      ? first.needsClarification === test.expected.needs_clarification
      : result.frame.issueId === expectedIssue
    const actCorrect = !test.expected.act || result.frame.act === test.expected.act
    const evidenceCorrect = test.expected.evidence_ids.every((item) =>
      result.frame.evidenceIds.includes(item))
    const positionCorrect = !test.expected.position ||
      result.frame.position === test.expected.position
    if (issueCorrect && actCorrect && evidenceCorrect && positionCorrect) understood++
    if (expectedIssue && result.frame.issueId !== expectedIssue && result.confidence >= 0.65) {
      confidentWrong++
    }

    if (expectedIssue && !result.needsClarification) {
      relevantTotal++
      const replies = planJurorReplies(result, runtime, beliefs)
      const firstMove = replies.find(({ moveId }) => moveId)?.moveId
      if (firstMove && pack.responseMoves.find(({ id: moveId }) =>
        moveId === firstMove)?.issueIds.includes(expectedIssue)) relevant++
      if (firstMove) {
        repeatTotal++
        const next = planJurorReplies(result, runtime, beliefs, [firstMove])
        if (next.some(({ moveId }) => moveId === firstMove)) repeated++
      }
    }
  }

  const total = pack.utterance_tests.length
  const metrics = {
    understoodWithinOneClarification: understood / total,
    confidentMisinterpretation: confidentWrong / total,
    relevantReply: relevantTotal ? relevant / relevantTotal : 0,
    repeatedMove: repeatTotal ? repeated / repeatTotal : 0,
  }
  return {
    ...metrics,
    passes:
      metrics.understoodWithinOneClarification >= 0.85 &&
      metrics.confidentMisinterpretation < 0.05 &&
      metrics.relevantReply >= 0.8 &&
      metrics.repeatedMove < 0.1,
  }
}
