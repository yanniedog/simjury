import { z } from 'zod'
import { caseStorageId, stableContentHash } from './caseRevision'
import {
  docketCaseIdSchema,
  docketCaseRevisionSchema,
  type DocketCaseAnalysisV4,
  type DocketCaseV4,
} from './caseSchema'

const text = z.string().trim().min(1)
const textList = z.array(text).min(1)
const approvalSchema = z
  .object({
    status: z.literal('approved'),
    reviewer: text,
    approved_at: z.string().datetime(),
    content_hash: text,
  })
  .strict()

export const legalSheetSchema = z
  .object({
    schema_version: z.literal(1),
    case_id: docketCaseIdSchema,
    case_revision: docketCaseRevisionSchema,
    jurisdiction: z.literal('State of Orinth'),
    statute: z
      .object({
        name: text,
        section: text,
        elements: z.array(text).min(2).max(6),
      })
      .strict(),
    agreed_facts: textList,
    disputed_facts: textList,
    best_case: z
      .object({
        prosecution: text,
        defence: text,
      })
      .strict(),
    foundations: z
      .array(
        z
          .object({
            beat_id: text,
            provenance: text,
            authentication: text,
            custody_and_integrity: text,
            admissibility: text,
            limitations: text,
          })
          .strict(),
      )
      .min(1),
    alternative_innocent_inference: text,
    required_directions: textList,
    epilogue_strategy: z.enum(['outcome_neutral', 'result_branched']),
    checks: z
      .object({
        victim_humanity: text,
        accused_prejudice: text,
      })
      .strict(),
    approvals: z
      .object({
        legal: approvalSchema,
        read_aloud: approvalSchema,
        blind_test: approvalSchema,
      })
      .strict(),
  })
  .strict()

export type LegalSheet = z.infer<typeof legalSheetSchema>

export function legalSheetContentHash(sheet: LegalSheet): string {
  const content = Object.fromEntries(
    Object.entries(sheet).filter(([key]) => key !== 'approvals'),
  )
  return `${sheet.case_revision}@legal-${stableContentHash(content)}`
}

/** Cross-file integrity checks for the V4 trial, reveal and legal sheet. */
export function checkV4EditorialBundle(
  trial: DocketCaseV4,
  analysis: DocketCaseAnalysisV4,
  sheet: LegalSheet,
): string[] {
  const issues: string[] = []
  const revision = caseStorageId(trial)
  const approvalHash = legalSheetContentHash(sheet)

  if (analysis.case_id !== trial.id || sheet.case_id !== trial.id) {
    issues.push('trial, analysis and legal sheet must share one case id')
  }
  if (
    analysis.case_revision !== revision ||
    sheet.case_revision !== revision
  ) {
    issues.push('analysis and legal sheet must match the current case revision')
  }
  for (const [name, approval] of Object.entries(sheet.approvals)) {
    if (approval.content_hash !== approvalHash) {
      issues.push(`${name} approval is stale`)
    }
  }
  if (
    sheet.statute.elements.length !== trial.elements.length ||
    sheet.statute.elements.some(
      (element, index) => element !== trial.elements[index],
    )
  ) {
    issues.push('legal-sheet elements must match the playable charge elements')
  }
  if (sheet.epilogue_strategy !== analysis.epilogue.mode) {
    issues.push('legal-sheet epilogue strategy must match post-verdict analysis')
  }

  const beatIds = new Set(trial.beats.map((beat) => beat.id))
  const analysisIds = new Set(analysis.beats.map((beat) => beat.beat_id))
  if (
    analysisIds.size !== beatIds.size ||
    [...beatIds].some((id) => !analysisIds.has(id))
  ) {
    issues.push('post-verdict analysis must cover every playable beat exactly once')
  }

  const foundationIds = new Set<string>()
  for (const item of sheet.foundations) {
    if (foundationIds.has(item.beat_id)) {
      issues.push(`foundation lists beat '${item.beat_id}' more than once`)
    }
    foundationIds.add(item.beat_id)
  }
  const materialIds = analysis.beats
    .filter((beat) => beat.analysis_role !== 'context')
    .map((beat) => beat.beat_id)
  for (const beatId of materialIds) {
    if (!foundationIds.has(beatId)) {
      issues.push(`material beat '${beatId}' needs an evidentiary foundation`)
    }
  }
  for (const beatId of foundationIds) {
    if (!beatIds.has(beatId)) {
      issues.push(`foundation references unknown beat '${beatId}'`)
    }
  }

  return issues
}
