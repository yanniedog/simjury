import { describe, expect, it, vi } from 'vitest'
import {
  REASONING_MODELS,
  type DeliberationPackV5,
} from '../../engine/deliberationPackV5'
import { loadV4CaseBundles, type V4CaseModuleMaps } from './caseBundles'
import { caseStorageId } from './caseRevision'
import {
  docketCaseAnalysisV4Schema,
  docketCaseV4Schema,
  type DocketCaseV4,
} from './caseSchema'
import { makeDocketCase, prose } from './fixtures'
import {
  legalSheetContentHash,
  legalSheetSchema,
} from './legalSheetSchema'

function makeTrial(): DocketCaseV4 {
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
  Object.assign(raw, {
    offence_code: 'murder',
    content_advisories: ['death'],
    detail_level: 'non_graphic',
    gen_meta: {
      ...(raw.gen_meta as object),
      prompt_version: 'dd-2026-v4',
      language_reviewer: 'Language reviewer',
      sensitivity_reviewer: 'Sensitivity reviewer',
    },
  })
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

function makePack(trial: DocketCaseV4): DeliberationPackV5 {
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
  }))
  return {
    schema_version: 5,
    case_id: trial.id,
    case_revision: caseStorageId(trial),
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
      text: 'On {issue}, which part should we test against {evidence}?',
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

function makeEditorialFiles(trial: DocketCaseV4) {
  const revision = caseStorageId(trial)
  const analysis = docketCaseAnalysisV4Schema.parse({
    schema_version: 4,
    case_id: trial.id,
    case_revision: revision,
    reference_verdict: 'Not Guilty',
    reference_reasoning: 'The prosecution did not exclude the alternative.',
    strongest_opposing_interpretation: 'The combined records support knowledge.',
    sentencing_context: 'Sentencing is for the judge after a conviction.',
    epilogue: { mode: 'outcome_neutral', text: 'The consequences continued.' },
    beats: trial.beats.map((beat, index) => ({
      beat_id: beat.id,
      editorial_weight: index === 0 ? 0.8 : 0.4,
      analysis_role: index === 0 ? 'central' : 'context',
      analysis_note: 'A qualified editorial assessment.',
    })),
  })
  const approval = {
    status: 'approved' as const,
    reviewer: 'Named reviewer',
    approved_at: '2026-07-29T00:00:00.000Z',
    content_hash: revision,
  }
  const sheet = legalSheetSchema.parse({
    schema_version: 1,
    case_id: trial.id,
    case_revision: revision,
    jurisdiction: 'State of Orinth',
    statute: { name: 'Criminal Code', section: 's 10', elements: trial.elements },
    agreed_facts: ['The material event occurred.'],
    disputed_facts: ['The accusedâ€™s knowledge remains disputed.'],
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
      victim_humanity: 'The affected person remains human.',
      accused_prejudice: 'Irrelevant prejudice is excluded.',
    },
    approvals: { legal: approval, read_aloud: approval, blind_test: approval },
  })
  const hash = legalSheetContentHash(sheet)
  Object.values(sheet.approvals).forEach((item) => {
    item.content_hash = hash
  })
  return { analysis, sheet }
}

function modulesFor(trial: DocketCaseV4): {
  modules: V4CaseModuleMaps
  analysisLoad: ReturnType<typeof vi.fn>
  legalLoad: ReturnType<typeof vi.fn>
  packLoad: ReturnType<typeof vi.fn>
} {
  const { analysis, sheet } = makeEditorialFiles(trial)
  const root = `/docket/${trial.id}`
  const analysisLoad = vi.fn(async () => analysis)
  const legalLoad = vi.fn(async () => sheet)
  const packLoad = vi.fn(async () => makePack(trial))
  return {
    modules: {
      trials: { [`${root}/trial.json`]: trial },
      analyses: { [`${root}/analysis.json`]: analysisLoad },
      legalSheets: { [`${root}/legal-sheet.json`]: legalLoad },
      deliberationPacks: { [`${root}/deliberation-pack.json`]: packLoad },
    },
    analysisLoad,
    legalLoad,
    packLoad,
  }
}

describe('V4 case bundle loading', () => {
  it('keeps all answer-key fields behind the post-verdict loader', async () => {
    const trial = makeTrial()
    const { modules, analysisLoad, legalLoad, packLoad } = modulesFor(trial)
    const [bundle] = loadV4CaseBundles(modules)

    expect(analysisLoad).not.toHaveBeenCalled()
    expect(legalLoad).not.toHaveBeenCalled()
    expect(packLoad).not.toHaveBeenCalled()
    const deliberationPack = await bundle.loadDeliberationPack()
    expect(JSON.stringify({
      trial: bundle.trial,
      deliberationPack,
    })).not.toMatch(/reference_verdict|verdict_truth|twist|epilogue/)
    expect(deliberationPack).not.toHaveProperty('utterance_tests')
    expect(analysisLoad).not.toHaveBeenCalled()
    expect(legalLoad).not.toHaveBeenCalled()

    const revealed = await bundle.loadPostVerdict()
    expect(revealed.analysis.reference_verdict).toBe('Not Guilty')
    expect(analysisLoad).toHaveBeenCalledOnce()
    expect(legalLoad).toHaveBeenCalledOnce()
    await bundle.loadPostVerdict()
    expect(analysisLoad).toHaveBeenCalledOnce()
  })

  it('clears rejected lazy promises so an explicit retry can recover', async () => {
    const trial = makeTrial()
    const setup = modulesFor(trial)
    setup.packLoad.mockRejectedValueOnce(new Error('temporary pack failure'))
    const [bundle] = loadV4CaseBundles(setup.modules)

    await expect(bundle.loadDeliberationPack()).rejects.toThrow('temporary pack failure')
    await expect(bundle.loadDeliberationPack()).resolves.toMatchObject({ case_id: trial.id })
    expect(setup.packLoad).toHaveBeenCalledTimes(2)

    setup.analysisLoad.mockRejectedValueOnce(new Error('temporary analysis failure'))
    await expect(bundle.loadPostVerdict()).rejects.toThrow('temporary analysis failure')
    await expect(bundle.loadPostVerdict()).resolves.toMatchObject({
      analysis: { case_id: trial.id },
    })
    expect(setup.analysisLoad).toHaveBeenCalledTimes(2)
  })

  it('fails closed when any bundle member targets another revision', async () => {
    const trial = makeTrial()
    const early = modulesFor(trial)
    const packPath = `/docket/${trial.id}/deliberation-pack.json`
    early.modules.deliberationPacks[packPath] = async () => ({
      ...makePack(trial),
      case_revision: `${trial.id}@00000000`,
    })
    const [earlyBundle] = loadV4CaseBundles(early.modules)
    await expect(earlyBundle.loadDeliberationPack()).rejects.toThrow(
      /deliberation pack must match current revision/,
    )

    const late = modulesFor(trial)
    const analysisPath = `/docket/${trial.id}/analysis.json`
    late.modules.analyses[analysisPath] = async () => ({
      ...makeEditorialFiles(trial).analysis,
      case_revision: `${trial.id}@00000000`,
    })
    const [bundle] = loadV4CaseBundles(late.modules)
    await expect(bundle.loadPostVerdict()).rejects.toThrow(
      /analysis and legal sheet must match the current case revision/,
    )
  })
})
