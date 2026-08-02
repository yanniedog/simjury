import {
  deliberationPackV5Schema,
  evaluateDeliberationPack,
  type DeliberationPackV5,
} from '../../engine/deliberationPackV5'
import { caseStorageId } from './caseRevision'
import {
  docketCaseAnalysisV4Schema,
  docketCaseV4Schema,
  type DocketCaseAnalysisV4,
  type DocketCaseV4,
} from './caseSchema'
import {
  checkV4EditorialBundle,
  legalSheetSchema,
} from './legalSheetSchema'

type LazyJsonModule = () => Promise<unknown>

export interface V4CaseModuleMaps {
  trials: Record<string, unknown>
  analyses: Record<string, LazyJsonModule>
  legalSheets: Record<string, LazyJsonModule>
  deliberationPacks: Record<string, LazyJsonModule>
}

/** The authored test corpus is validated, then discarded from player state. */
export type ClientDeliberationPack = Omit<
  DeliberationPackV5,
  'utterance_tests'
>

export interface V4PostVerdictPayload {
  analysis: DocketCaseAnalysisV4
}

export interface V4CaseBundle {
  schemaVersion: 4
  trial: DocketCaseV4
  loadDeliberationPack: () => Promise<ClientDeliberationPack>
  /**
   * The only route to editorial analysis. Call after a verdict is sealed.
   * Legal-sheet data is used for validation but is never returned to the UI.
   */
  loadPostVerdict: () => Promise<V4PostVerdictPayload>
}

const SPOILER_KEYS = new Set([
  'reference_verdict',
  'verdict_truth',
  'twist',
  'epilogue',
])

function assertSpoilerSafe(value: unknown, path = 'payload'): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (SPOILER_KEYS.has(key)) {
      throw new Error(`V4 pre-verdict ${path} contains forbidden field '${key}'`)
    }
    assertSpoilerSafe(child, `${path}.${key}`)
  }
}

function moduleValue(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'default' in value &&
    Object.keys(value).length === 1
  ) {
    return (value as { default: unknown }).default
  }
  return value
}

function clientPack(pack: DeliberationPackV5): ClientDeliberationPack {
  const copy = { ...pack } as Partial<DeliberationPackV5>
  delete copy.utterance_tests
  return copy as ClientDeliberationPack
}

function assertAdmissiblePack(
  trial: DocketCaseV4,
  pack: DeliberationPackV5,
): void {
  const knownBeatIds = new Set(trial.beats.map(({ id }) => id))
  const excludedBeatIds = new Set(
    trial.beats
      .filter((beat) => beat.interjections?.some((interjection) =>
        (interjection.type === 'sustained' || interjection.type === 'ruling') &&
        interjection.admissibility.effect === 'exclude_beat'))
      .map(({ id }) => id),
  )
  for (const evidence of pack.evidence) {
    for (const beatId of evidence.beatIds) {
      if (!knownBeatIds.has(beatId)) {
        throw new Error(`V4 deliberation evidence ${evidence.id} references unknown beat ${beatId}`)
      }
      if (excludedBeatIds.has(beatId)) {
        throw new Error(`V4 deliberation evidence ${evidence.id} references excluded beat ${beatId}`)
      }
    }
  }
}

function siblingPath(trialPath: string, filename: string): string {
  if (!trialPath.endsWith('/trial.json')) {
    throw new Error(`Invalid V4 trial path ${trialPath}`)
  }
  return `${trialPath.slice(0, -'/trial.json'.length)}/${filename}`
}

function assertNoOrphans(
  name: string,
  paths: string[],
  trialPaths: Set<string>,
): void {
  for (const path of paths) {
    const trialPath = path.replace(new RegExp(`/${name}\\.json$`), '/trial.json')
    if (!trialPaths.has(trialPath)) {
      throw new Error(`Orphaned V4 ${name} module ${path}`)
    }
  }
}

/**
 * Build revision-bound V4 bundles. Trial data is validated immediately;
 * deliberation loads on demand, while answer-key analysis and the legal sheet
 * remain separate lazy chunks until the caller seals a verdict.
 */
export function loadV4CaseBundles(modules: V4CaseModuleMaps): V4CaseBundle[] {
  const trialPaths = new Set(Object.keys(modules.trials))
  const caseIds = new Set<string>()
  assertNoOrphans('analysis', Object.keys(modules.analyses), trialPaths)
  assertNoOrphans('legal-sheet', Object.keys(modules.legalSheets), trialPaths)
  assertNoOrphans(
    'deliberation-pack',
    Object.keys(modules.deliberationPacks),
    trialPaths,
  )

  return [...trialPaths].sort().map((trialPath) => {
    const analysisPath = siblingPath(trialPath, 'analysis.json')
    const legalSheetPath = siblingPath(trialPath, 'legal-sheet.json')
    const deliberationPath = siblingPath(trialPath, 'deliberation-pack.json')
    const analysisModule = modules.analyses[analysisPath]
    const legalSheetModule = modules.legalSheets[legalSheetPath]
    const deliberationModule = modules.deliberationPacks[deliberationPath]
    if (!analysisModule || !legalSheetModule || !deliberationModule) {
      throw new Error(`Incomplete V4 case bundle ${trialPath}`)
    }

    const trial = docketCaseV4Schema.parse(moduleValue(modules.trials[trialPath]))
    const directoryId = trialPath.split('/').at(-2)
    if (directoryId !== trial.id) {
      throw new Error(`V4 trial id ${trial.id} does not match ${trialPath}`)
    }
    if (caseIds.has(trial.id)) {
      throw new Error(`Duplicate V4 case id ${trial.id}`)
    }
    caseIds.add(trial.id)
    const revision = caseStorageId(trial)
    assertSpoilerSafe(trial)

    let deliberationPack: Promise<ClientDeliberationPack> | undefined
    const loadDeliberationPack = () => {
      deliberationPack ??= deliberationModule()
        .then((raw) => {
          const pack = deliberationPackV5Schema.parse(moduleValue(raw))
          if (pack.case_id !== trial.id || pack.case_revision !== revision) {
            throw new Error(
              `V4 deliberation pack must match current revision ${revision}`,
            )
          }
          assertAdmissiblePack(trial, pack)
          if (!evaluateDeliberationPack(pack).passes) {
            throw new Error(`V4 deliberation pack failed its language quality gate`)
          }
          const payload = clientPack(pack)
          assertSpoilerSafe(payload)
          return payload
        })
        .catch((error) => {
          deliberationPack = undefined
          throw error
        })
      return deliberationPack
    }

    let postVerdict: Promise<V4PostVerdictPayload> | undefined
    const loadPostVerdict = () => {
      postVerdict ??= Promise.all([
        loadDeliberationPack(),
        analysisModule(),
        legalSheetModule(),
      ]).then(
        ([, rawAnalysis, rawSheet]) => {
          const analysis = docketCaseAnalysisV4Schema.parse(
            moduleValue(rawAnalysis),
          )
          const sheet = legalSheetSchema.parse(moduleValue(rawSheet))
          const issues = checkV4EditorialBundle(trial, analysis, sheet)
          if (issues.length) {
            throw new Error(
              `Invalid V4 editorial bundle ${trial.id}: ${issues.join('; ')}`,
            )
          }
          return { analysis }
        },
      ).catch((error) => {
        postVerdict = undefined
        throw error
      })
      return postVerdict
    }

    return {
      schemaVersion: 4,
      trial,
      loadDeliberationPack,
      loadPostVerdict,
    }
  })
}
