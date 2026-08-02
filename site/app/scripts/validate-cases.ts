/**
 * CI gate for the case queues. Validates every JSON file in cases/ (v1 daily)
 * and docket/ (v2 Daily Docket) against its schema, then runs the matching
 * design-quality gate over each whole queue (traps, real signals, solvability,
 * uniqueness, verdict variety -- plus, for v2, pacing, courtroom structure, and
 * jury dynamics). Exits non-zero on any problem so a badly formed *or* badly
 * designed case can never reach a queue. An empty-but-present directory is a
 * legitimate pre-content state; a missing directory is a broken checkout.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ZodType } from 'zod'
import { caseSchema, type TrialCase } from '../src/lib/caseSchema'
import { checkQueue, type QualityIssue } from '../src/lib/caseQuality'
import { docketCaseSchema, type DocketCase } from '../src/lib/v2/caseSchema'
import {
  checkDocketCase,
  checkDocketQueue,
  checkActiveCorpus,
} from '../src/lib/v2/caseQuality'
import {
  docketCoverage,
  docketCoverageError,
  docketRunwayError,
  formatDocketCoverage,
} from '../src/lib/v2/runway'
import { checkDynamics } from '../src/engine/dynamics'

// Resolve relative to this script, not the process cwd, so it works the same
// from CI (repo root) and from anywhere locally.
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_ROOT = resolve(APP_ROOT, 'public')

function checkV3MediaFiles(
  cases: DocketCase[],
): Pick<QualityIssue, 'caseId' | 'message'>[] {
  const issues: Pick<QualityIssue, 'caseId' | 'message'>[] = []

  for (const trial of cases.filter(
    (candidate) => candidate.gen_meta.prompt_version === 'dd-2026-v3',
  )) {
    if (!trial.media) {
      issues.push({
        caseId: trial.id,
        message: 'v3 case is missing its media manifest',
      })
      continue
    }
    const media = [
      ['cover', trial.media.cover.src],
      ...Object.entries(trial.media.portraits ?? {}).map(([speakerId, asset]) => [
        `portrait ${speakerId}`,
        asset.src,
      ]),
    ]

    for (const [label, src] of media) {
      const publicPath = src.startsWith('/today/')
        ? src.slice('/today/'.length)
        : src.replace(/^\/+/, '')
      const diskPath = resolve(PUBLIC_ROOT, publicPath)
      if (
        !diskPath.startsWith(`${PUBLIC_ROOT}${sep}`) ||
        !existsSync(diskPath)
      ) {
        issues.push({
          caseId: trial.id,
          message: `${label} media file is missing: ${src}`,
        })
      }
    }
  }

  return issues
}

interface Queue<T> {
  name: string
  dir: string
  schema: ZodType<T>
  gate: (cases: T[]) => Pick<QualityIssue, 'caseId' | 'message'>[]
}

function validateQueue<T>(q: Queue<T>, errors: string[]): number {
  let files: string[]
  try {
    files = readdirSync(q.dir).filter((f) => f.endsWith('.json'))
  } catch (e) {
    errors.push(
      `${q.name}/ not found at ${q.dir}; it must exist in the repo. (${(e as Error).message})`,
    )
    return 0
  }

  if (files.length === 0) {
    console.warn(`${q.name}/ has no .json cases yet -- nothing to validate.`)
    // Queue-level gates still matter for an empty live queue. The legacy v1
    // gate permits its pre-content state; the docket runway gate rejects it.
    for (const issue of q.gate([])) {
      errors.push(`${q.name}/${issue.caseId}: ${issue.message}`)
    }
    return 0
  }

  const parsed: T[] = []
  const before = errors.length

  for (const file of files.sort()) {
    let json: unknown
    try {
      json = JSON.parse(readFileSync(join(q.dir, file), 'utf8'))
    } catch (e) {
      errors.push(`${q.name}/${file}: invalid JSON (${(e as Error).message})`)
      continue
    }

    const result = q.schema.safeParse(json)
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      errors.push(`${q.name}/${file}: ${detail}`)
      continue
    }

    parsed.push(result.data)
  }

  // Design-quality + integrity gate over the whole queue. Only run once every
  // file in this queue is schema-valid.
  if (errors.length === before) {
    for (const issue of q.gate(parsed)) {
      errors.push(`${q.name}/${issue.caseId}: ${issue.message}`)
    }
  }

  return files.length
}

function main(): void {
  const errors: string[] = []
  let total = 0

  total += validateQueue<TrialCase>(
    { name: 'cases', dir: join(APP_ROOT, 'cases'), schema: caseSchema, gate: checkQueue },
    errors,
  )
  total += validateQueue<DocketCase>(
    {
      name: 'docket',
      dir: join(APP_ROOT, 'docket'),
      schema: docketCaseSchema,
      // Design gate, then the deliberation-dynamics simulation: a docket case
      // only ships if its room is alive (see src/engine/dynamics.ts).
      gate: (cases) => {
        // dd-intro stays off the daily publish/runway calendar and queue
        // variety checks, but it must pass the same per-case design-quality
        // and dynamics gates as every featured docket case.
        const dailyCases = cases.filter((c) => c.id !== 'dd-intro')
        const introCases = cases.filter((c) => c.id === 'dd-intro')
        const publishDates = dailyCases.map((c) => c.publish_date)
        const runwayError = docketRunwayError(publishDates)
        const coverageError = docketCoverageError(publishDates)
        // Print it whether or not it fails. The horizon gate can pass while
        // most days open nothing new, and a number nobody sees is a number
        // nobody acts on.
        console.log(formatDocketCoverage(docketCoverage(publishDates)))
        return [
          ...(coverageError
            ? [{ caseId: 'docket', message: coverageError, kind: 'design' as const }]
            : []),
          ...checkActiveCorpus(cases),
          ...checkV3MediaFiles(cases),
          ...checkDocketQueue(dailyCases),
          ...introCases.flatMap((c) =>
            checkDocketCase(c).map((message) => ({
              caseId: c.id,
              message,
              kind: 'design' as const,
            })),
          ),
          ...cases.flatMap((c) =>
            checkDynamics(c).map((message) => ({
              caseId: c.id,
              message,
              kind: 'design' as const,
            })),
          ),
          ...(runwayError
            ? [{ caseId: 'queue', message: runwayError }]
            : []),
        ]
      },
    },
    errors,
  )

  if (errors.length > 0) {
    console.error(`Case validation failed (${errors.length} problem(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(`Validated ${total} case(s) across both queues. All good.`)
}

main()
