import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { ZodType } from 'zod'
import {
  deliberationPackV5Schema,
  evaluateDeliberationPack,
} from '../src/engine/deliberationPackV5'
import {
  docketCaseAnalysisV4Schema,
  docketCaseSchema,
  docketCaseV4Schema,
  type DocketCase,
  type DocketCaseV4,
} from '../src/lib/v2/caseSchema'
import { caseStorageId } from '../src/lib/v2/caseRevision'
import { checkV4Interjections } from '../src/lib/v2/caseQuality'
import {
  checkV4EditorialBundle,
  legalSheetSchema,
} from '../src/lib/v2/legalSheetSchema'

const BUNDLE_NAMES = [
  'trial.json',
  'analysis.json',
  'legal-sheet.json',
  'deliberation-pack.json',
] as const

export interface DocketBundleFiles {
  id: string
  dir: string
  trial: string
  analysis: string
  legalSheet: string
  deliberationPack: string
}

export interface DocketFiles {
  flatCases: string[]
  bundles: DocketBundleFiles[]
  errors: string[]
}

export interface LoadedDocket {
  v3Cases: DocketCase[]
  v4Cases: DocketCaseV4[]
  errors: string[]
}

export type ActiveDocketCase = DocketCase | DocketCaseV4

interface MediaIssue {
  caseId: string
  message: string
}

export function discoverDocketFiles(docketDir: string): DocketFiles {
  const result: DocketFiles = { flatCases: [], bundles: [], errors: [] }
  let entries
  try {
    entries = readdirSync(docketDir, { withFileTypes: true })
  } catch (error) {
    result.errors.push(`docket/ not found at ${docketDir} (${(error as Error).message})`)
    return result
  }

  result.flatCases = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(docketDir, entry.name))
    .sort()

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    const dir = join(docketDir, entry.name)
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((child) => child.isFile())
      .map((child) => child.name)
    const missing = BUNDLE_NAMES.filter((name) => !names.includes(name))
    const expected = new Set<string>(BUNDLE_NAMES)
    const unexpected = names.filter(
      (name) => name.endsWith('.json') && !expected.has(name),
    )
    if (missing.length || unexpected.length) {
      if (missing.length) {
        result.errors.push(
          `docket/${entry.name}: incomplete V4 bundle; missing ${missing.join(', ')}`,
        )
      }
      if (missing.includes('trial.json')) {
        for (const name of names.filter((candidate) => expected.has(candidate))) {
          result.errors.push(
            `docket/${entry.name}/${name}: orphaned V4 component without trial.json`,
          )
        }
      }
      for (const name of unexpected) {
        result.errors.push(`docket/${entry.name}/${name}: orphaned V4 JSON file`)
      }
      continue
    }
    result.bundles.push({
      id: entry.name,
      dir,
      trial: join(dir, BUNDLE_NAMES[0]),
      analysis: join(dir, BUNDLE_NAMES[1]),
      legalSheet: join(dir, BUNDLE_NAMES[2]),
      deliberationPack: join(dir, BUNDLE_NAMES[3]),
    })
  }
  result.bundles.sort((a, b) => a.id.localeCompare(b.id))
  return result
}

function parseFile<T>(
  file: string,
  label: string,
  schema: ZodType<T>,
  errors: string[],
): T | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`${label}: invalid JSON (${(error as Error).message})`)
    return null
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    errors.push(`${label}: ${detail}`)
    return null
  }
  return result.data
}

export function loadDocketFiles(docketDir: string): LoadedDocket {
  const discovered = discoverDocketFiles(docketDir)
  const errors = [...discovered.errors]
  const v3Cases = discovered.flatCases.flatMap((file) => {
    const name = file.split(/[\\/]/).at(-1) ?? file
    const trial = parseFile(file, `docket/${name}`, docketCaseSchema, errors)
    return trial ? [trial] : []
  })
  const v4Cases: DocketCaseV4[] = []

  for (const bundle of discovered.bundles) {
    const prefix = `docket/${bundle.id}`
    const trial = parseFile(bundle.trial, `${prefix}/trial.json`, docketCaseV4Schema, errors)
    const analysis = parseFile(
      bundle.analysis,
      `${prefix}/analysis.json`,
      docketCaseAnalysisV4Schema,
      errors,
    )
    const sheet = parseFile(bundle.legalSheet, `${prefix}/legal-sheet.json`, legalSheetSchema, errors)
    const pack = parseFile(
      bundle.deliberationPack,
      `${prefix}/deliberation-pack.json`,
      deliberationPackV5Schema,
      errors,
    )
    if (trial) {
      for (const issue of checkV4Interjections(trial)) {
        errors.push(`${prefix}/trial.json: ${issue}`)
      }
    }
    if (!trial || !analysis || !sheet || !pack) continue
    if (trial.id !== bundle.id) {
      errors.push(`${prefix}/trial.json: case id '${trial.id}' does not match its directory`)
    }
    const revision = caseStorageId(trial)
    if (pack.case_id !== trial.id || pack.case_revision !== revision) {
      errors.push(`${prefix}/deliberation-pack.json: pack must match current revision ${revision}`)
    }
    if (!evaluateDeliberationPack(pack).passes) {
      errors.push(`${prefix}/deliberation-pack.json: language quality gate failed`)
    }
    for (const issue of checkV4EditorialBundle(trial, analysis, sheet)) {
      errors.push(`${prefix}: ${issue}`)
    }
    v4Cases.push(trial)
  }

  const seen = new Set<string>()
  for (const trial of [...v3Cases, ...v4Cases]) {
    if (seen.has(trial.id)) errors.push(`docket/${trial.id}: duplicate active case id`)
    seen.add(trial.id)
  }
  return { v3Cases, v4Cases, errors }
}

function isContained(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

export function checkActiveMediaFiles(
  cases: ActiveDocketCase[],
  publicRoot: string,
): MediaIssue[] {
  const issues: MediaIssue[] = []
  const canonicalPublicRoot = realpathSync(publicRoot)
  for (const trial of cases) {
    if (!trial.media) {
      issues.push({ caseId: trial.id, message: 'active case is missing its media manifest' })
      continue
    }
    const portraits = trial.media.portraits ?? {}
    const requiredPortraitIds = [
      ...trial.cast.map(({ id }) => id),
      ...trial.jury.jurors.map(({ id }) => id),
    ]
    for (const id of requiredPortraitIds) {
      if (!portraits[id]) {
        issues.push({ caseId: trial.id, message: `media manifest is missing portrait '${id}'` })
      }
    }
    const assets = [
      ['cover', trial.media.cover.src],
      ['accused', trial.media.accused.src],
      ...Object.entries(trial.media.beats).map(([id, asset]) => [`beat ${id}`, asset.src]),
      ...Object.entries(portraits).map(([id, asset]) => [`portrait ${id}`, asset.src]),
    ]
    const caseRoot = resolve(canonicalPublicRoot, 'media', trial.id)
    for (const [label, src] of assets) {
      const relativePublicPath = src.startsWith('/today/')
        ? src.slice('/today/'.length)
        : src.replace(/^\/+/, '')
      const diskPath = resolve(canonicalPublicRoot, relativePublicPath)
      if (!isContained(caseRoot, diskPath)) {
        issues.push({ caseId: trial.id, message: `${label} media path is unsafe or outside its case: ${src}` })
      } else if (!existsSync(diskPath) || !statSync(diskPath).isFile()) {
        issues.push({ caseId: trial.id, message: `${label} media file is missing: ${src}` })
      } else {
        const canonicalDiskPath = realpathSync(diskPath)
        if (
          !isContained(canonicalPublicRoot, canonicalDiskPath) ||
          !isContained(realpathSync(caseRoot), canonicalDiskPath)
        ) {
          issues.push({ caseId: trial.id, message: `${label} media resolves outside its case: ${src}` })
        }
      }
    }
  }
  return issues
}
