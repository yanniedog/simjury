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
import { makeDocketCase, prose } from './fixtures'
import { checkV4Interjections } from './caseQuality'
import { scanDocketCaseTokens } from './bannedTokens'
import {
  durationWordCount,
  estimateV4Duration,
  V4_DURATION_MINUTES_MAX,
  V4_DURATION_MINUTES_MIN,
  V4_EVIDENCE_WORDS_MIN,
  V4_SCENE_WORDS_MIN,
  V4_STATEMENT_WORDS_MIN,
} from './duration'
import {
  checkV4EditorialBundle,
  legalSheetContentHash,
  legalSheetSchema,
} from './legalSheetSchema'

function makeV4Case(): DocketCaseV4 {
  const raw = structuredClone(makeDocketCase()) as unknown as Record<string, unknown>
  delete raw.reference_verdict
  delete raw.twist
  delete raw.epilogue
  delete (raw.accused as Record<string, unknown>).if_guilty
  for (const beat of raw.beats as Array<Record<string, unknown>>) {
    delete beat.true_weight
    delete beat.reveal_stamp
    delete beat.reveal_note
  }
  raw.offence_code = 'murder'
  raw.content_advisories = ['death']
  raw.detail_level = 'non_graphic'
  const metadata = raw.gen_meta as Record<string, unknown>
  metadata.prompt_version = 'dd-2026-v4'
  metadata.language_reviewer = 'Language reviewer'
  metadata.sensitivity_reviewer = 'Sensitivity reviewer'
  raw.setting = `${raw.setting} ${prose(130)}`
  const statements = raw.statements as Record<
    'opening' | 'closing',
    Record<'prosecution' | 'defence', { text: string }>
  >
  for (const phase of Object.values(statements)) {
    for (const statement of Object.values(phase)) {
      statement.text = `${statement.text} ${prose(30)}`
    }
  }
  for (const beat of raw.beats as Array<{
    text: string
    turns?: Array<{ text: string }>
  }>) {
    if (beat.turns?.length) {
      beat.turns[beat.turns.length - 1].text += ` ${prose(33)}`
    } else {
      beat.text += ` ${prose(33)}`
    }
  }
  return docketCaseV4Schema.parse(raw)
}

function addSustainedObjection(trial: DocketCaseV4): void {
  trial.beats[1].interjections = [
    {
      id: 'hearsay-objection',
      after_turn: 1,
      speaker: 'pros',
      type: 'objection',
      ground: 'hearsay',
      text: 'Objection, hearsay.',
    },
    {
      id: 'hearsay-sustained',
      after_turn: 1,
      speaker: 'judge',
      type: 'sustained',
      resolves: 'hearsay-objection',
      admissibility: { effect: 'exclude_beat' },
      text: 'Sustained. The jury must disregard this entire item.',
    },
  ]
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
    epilogue: {
      mode: 'outcome_neutral',
      text: 'The people involved continued living with the unresolved consequences.',
    },
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
    epilogue_strategy: 'outcome_neutral',
    checks: {
      victim_humanity: 'The affected person is treated as a person.',
      accused_prejudice: 'Irrelevant punishment is excluded.',
    },
    approvals: { legal: approval, read_aloud: approval, blind_test: approval },
  })
  const approvalHash = legalSheetContentHash(sheet)
  for (const item of Object.values(sheet.approvals)) {
    item.content_hash = approvalHash
  }
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
      { epilogue: 'The authored outcome.' },
      { accused: { ...trial.accused, if_guilty: 'Pre-verdict punishment.' } },
      { beats: [oldBeat, ...trial.beats.slice(1)] },
    ]) {
      expect(docketCaseV4Schema.safeParse({ ...trial, ...legacy }).success).toBe(false)
    }
    for (const field of ['offence_code', 'content_advisories', 'detail_level']) {
      const incomplete = { ...trial } as Record<string, unknown>
      delete incomplete[field]
      expect(docketCaseV4Schema.safeParse(incomplete).success).toBe(false)
    }
    expect(docketCaseV4Schema.safeParse({
      ...trial,
      gen_meta: { ...trial.gen_meta, language_reviewer: undefined },
    }).success).toBe(false)
  })

  it('enforces the 19-21 minute estimate on V4 only', () => {
    const trial = makeV4Case()
    const estimate = estimateV4Duration(trial)
    expect(estimate.totalMinutes).toBeGreaterThanOrEqual(V4_DURATION_MINUTES_MIN)
    expect(estimate.totalMinutes).toBeLessThanOrEqual(V4_DURATION_MINUTES_MAX)
    expect(estimate.sceneWords).toBeGreaterThanOrEqual(V4_SCENE_WORDS_MIN)
    expect(estimate.statementWords).toBeGreaterThanOrEqual(V4_STATEMENT_WORDS_MIN)
    expect(estimate.evidenceWords).toBeGreaterThanOrEqual(V4_EVIDENCE_WORDS_MIN)

    const short = structuredClone(trial)
    short.setting = short.charge = short.hook = short.accused.human = 'Brief.'
    short.elements = short.elements.map(() => 'Brief.')
    for (const phase of [short.statements.opening, short.statements.closing]) {
      phase.prosecution.text = phase.defence.text = 'Brief.'
    }
    short.beats = short.beats.map((beat) => ({
      ...beat,
      text: 'Brief.',
      turns: beat.turns?.map((turn) => ({ ...turn, text: 'Brief.' })),
    }))
    expect(estimateV4Duration(short).totalMinutes).toBeLessThan(V4_DURATION_MINUTES_MIN)
    const shortResult = docketCaseV4Schema.safeParse(short)
    expect(shortResult.success).toBe(false)
    if (!shortResult.success) {
      expect(shortResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            `V4 cases must take ${V4_DURATION_MINUTES_MIN}-${V4_DURATION_MINUTES_MAX} minutes`,
          ),
        }),
      ]))
    }

    const long = structuredClone(trial)
    const longText = Array.from({ length: 220 }, () => 'evidence').join(' ')
    long.beats = long.beats.map((beat) => ({
      ...beat,
      text: longText,
      turns: undefined,
    }))
    expect(estimateV4Duration(long).totalMinutes).toBeGreaterThan(V4_DURATION_MINUTES_MAX)
    const longResult = docketCaseV4Schema.safeParse(long)
    expect(longResult.success).toBe(false)
    if (!longResult.success) {
      expect(longResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            `V4 cases must take ${V4_DURATION_MINUTES_MIN}-${V4_DURATION_MINUTES_MAX} minutes`,
          ),
        }),
      ]))
    }

    expect(docketCaseSchema.safeParse(makeDocketCase()).success).toBe(true)
  })

  it('orders and resolves earned objections while counting every spoken word', () => {
    const trial = makeV4Case()
    const before = estimateV4Duration(trial)
    addSustainedObjection(trial)
    const parsed = docketCaseV4Schema.parse(trial)
    const interjections = parsed.beats[1].interjections ?? []

    expect(interjections.map((item) => item.type)).toEqual([
      'objection',
      'sustained',
    ])
    expect(checkV4Interjections(parsed)).toEqual([])
    expect(estimateV4Duration(parsed).evidenceWords - before.evidenceWords).toBe(
      interjections.reduce(
        (total, item) => total + durationWordCount(item.text),
        0,
      ),
    )
    expect(docketCaseSchema.safeParse(makeDocketCase()).success).toBe(true)
  })

  it('rejects broken turn anchors and objection references', () => {
    const unknownGround = makeV4Case()
    addSustainedObjection(unknownGround)
    Object.assign(unknownGround.beats[1].interjections?.[0] ?? {}, {
      ground: 'foundation',
    })
    expect(docketCaseV4Schema.safeParse(unknownGround).success).toBe(false)

    const unresolved = makeV4Case()
    addSustainedObjection(unresolved)
    unresolved.beats[1].interjections?.pop()
    const unresolvedResult = docketCaseV4Schema.safeParse(unresolved)
    expect(unresolvedResult.success).toBe(false)
    if (!unresolvedResult.success) {
      expect(unresolvedResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: "objection 'hearsay-objection' has no authored resolution",
        }),
      ]))
    }

    const misplaced = makeV4Case()
    addSustainedObjection(misplaced)
    const resolution = misplaced.beats[1].interjections?.[1]
    if (resolution) resolution.after_turn = 3
    const misplacedResult = docketCaseV4Schema.safeParse(misplaced)
    expect(misplacedResult.success).toBe(false)
    if (!misplacedResult.success) {
      expect(misplacedResult.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('exceeds 2 authored turn'),
        }),
        expect.objectContaining({
          message: expect.stringContaining('must share objection'),
        }),
      ]))
    }
  })

  it('quality-checks courtroom roles, recognized usage, and banned text', () => {
    const trial = makeV4Case()
    addSustainedObjection(trial)
    const objection = trial.beats[1].interjections?.[0]
    if (objection?.type === 'objection') {
      objection.ground = 'leading'
      objection.speaker = 'defc'
      objection.text = 'Objection. Google supplied the record.'
    }
    const issues = checkV4Interjections(trial).join('\n')
    expect(issues).toMatch(/cannot use leading as its ground on cross-examination/)
    expect(issues).toMatch(/must come from opposing counsel/)
    expect(issues).toMatch(/banned token "google" in beats\[1\]\.interjections\[0\]\.text/)
    expect(scanDocketCaseTokens(trial).join()).toMatch(/interjections\[0\]\.text/)
  })

  it('rejects a duration-compliant case that starves public-juror context', () => {
    const trial = makeV4Case()
    const originalWords = estimateV4Duration(trial).spokenWords
    trial.setting = trial.charge = trial.hook = trial.accused.human = 'Brief.'
    trial.elements = trial.elements.map(() => 'Brief.')
    const shortened = estimateV4Duration(trial)
    const replacementWords = originalWords - shortened.spokenWords
    const dialogueBeat = trial.beats.find((beat) => beat.turns?.length)
    expect(dialogueBeat).toBeDefined()
    dialogueBeat!.turns![0].text += ` ${prose(replacementWords)}`

    const estimate = estimateV4Duration(trial)
    expect(estimate.totalMinutes).toBeGreaterThanOrEqual(V4_DURATION_MINUTES_MIN)
    expect(estimate.totalMinutes).toBeLessThanOrEqual(V4_DURATION_MINUTES_MAX)
    const result = docketCaseV4Schema.safeParse(trial)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('public-juror context needs at least'),
        }),
      ]))
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
    expect(docketCaseAnalysisV4Schema.safeParse({
      ...analysis,
      reference_reasoning: ' ',
    }).success).toBe(false)

    analysis.beats.pop()
    sheet.required_directions.push('A later legal-sheet change.')
    sheet.foundations.push(sheet.foundations[0])
    expect(checkV4EditorialBundle(trial, analysis, sheet)).toEqual(expect.arrayContaining([
      'legal approval is stale',
      'post-verdict analysis must cover every playable beat exactly once',
      `foundation lists beat '${trial.beats[0].id}' more than once`,
    ]))
  })

  it('binds limited-purpose rulings to analysis and the legal sheet', () => {
    const trial = makeV4Case()
    trial.beats[0].interjections = [{
      id: 'purpose-ruling',
      after_turn: 1,
      speaker: 'judge',
      type: 'ruling',
      ground: 'hearsay',
      admissibility: {
        effect: 'limited_purpose',
        purpose: 'Use the statement only to assess the witnessâ€™s state of mind.',
      },
      text: 'You may use that statement only to assess the witnessâ€™s state of mind.',
    }]
    const parsed = docketCaseV4Schema.parse(trial)
    const { analysis, sheet } = makeBundle(parsed)
    expect(checkV4EditorialBundle(parsed, analysis, sheet)).toEqual(
      expect.arrayContaining([
        "beat 'b1' analysis must match its authored admissibility effect",
        "beat 'b1' legal sheet must match its authored admissibility effect",
      ]),
    )

    const effect = parsed.beats[0].interjections?.[0]
    if (effect?.type !== 'ruling') throw new Error('Expected authored ruling')
    analysis.beats[0].admissibility = effect.admissibility
    sheet.foundations[0].admissibility_effect = effect.admissibility
    const approvalHash = legalSheetContentHash(sheet)
    Object.values(sheet.approvals).forEach((approval) => {
      approval.content_hash = approvalHash
    })
    expect(checkV4EditorialBundle(parsed, analysis, sheet)).toEqual([])

    analysis.beats[0].admissibility = {
      effect: 'limited_purpose',
      purpose: 'Use it for a different purpose.',
    }
    expect(checkV4EditorialBundle(parsed, analysis, sheet)).toContain(
      "beat 'b1' analysis must match its authored admissibility effect",
    )

    const excluded = makeV4Case()
    addSustainedObjection(excluded)
    const excludedBundle = makeBundle(excluded)
    excludedBundle.analysis.beats[1].admissibility = {
      effect: 'exclude_beat',
    }
    expect(
      checkV4EditorialBundle(
        excluded,
        excludedBundle.analysis,
        excludedBundle.sheet,
      ),
    ).toContain("excluded beat 'b2' cannot carry editorial weight")
  })
})
