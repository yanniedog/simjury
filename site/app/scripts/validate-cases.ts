/**
 * CI gate for the case queues. Validates every JSON file in cases/ (v1 daily)
 * and docket/ (v2 Daily Docket) against its schema, then runs the matching
 * design-quality gate over each whole queue (traps, real signals, solvability,
 * uniqueness, verdict variety -- plus, for v2, pacing, courtroom structure, and
 * jury dynamics). Exits non-zero on any problem so a badly formed *or* badly
 * designed case can never reach a queue. An empty-but-present directory is a
 * legitimate pre-content state; a missing directory is a broken checkout.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ZodType } from 'zod'
import { caseSchema, type TrialCase } from '../src/lib/caseSchema'
import { checkQueue, type QualityIssue } from '../src/lib/caseQuality'
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
import { checkActiveMediaFiles, loadDocketFiles } from './docket-files'

// Resolve relative to this script, not the process cwd, so it works the same
// from CI (repo root) and from anywhere locally.
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_ROOT = resolve(APP_ROOT, 'public')

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
  const docket = loadDocketFiles(join(APP_ROOT, 'docket'))
  errors.push(...docket.errors)
  total += docket.v3Cases.length + docket.v4Cases.length
  if (docket.errors.length === 0) {
    const cases = docket.v3Cases
    const activeCases = [...cases, ...docket.v4Cases]
    // dd-intro stays off the daily publish/runway calendar and queue variety
    // checks, but still passes per-case quality and dynamics gates.
    const dailyCases = cases.filter((c) => c.id !== 'dd-intro')
    const introCases = cases.filter((c) => c.id === 'dd-intro')
    const publishDates = activeCases
      .filter((c) => c.id !== 'dd-intro')
      .map((c) => c.publish_date)
    const runwayError = docketRunwayError(publishDates)
    const coverageError = docketCoverageError(publishDates)
    console.log(formatDocketCoverage(docketCoverage(publishDates)))
    const issues = [
      ...(coverageError
        ? [{ caseId: 'docket', message: coverageError, kind: 'design' as const }]
        : []),
      ...checkActiveCorpus(activeCases),
      ...checkActiveMediaFiles(activeCases, PUBLIC_ROOT),
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
      ...(runwayError ? [{ caseId: 'queue', message: runwayError }] : []),
    ]
    issues.forEach((issue) =>
      errors.push(`docket/${issue.caseId}: ${issue.message}`),
    )
  }

  if (errors.length > 0) {
    console.error(`Case validation failed (${errors.length} problem(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(`Validated ${total} case(s) across both queues. All good.`)
}

main()
