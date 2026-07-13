/**
 * CI gate for the case queues. Validates every JSON file in cases/ (v1 daily)
 * and docket/ (v2 Daily Docket) against its schema, then runs the matching
 * design-quality gate over each whole queue (traps, real signals, solvability,
 * uniqueness, verdict variety — plus, for v2, pacing, courtroom structure, and
 * jury dynamics). Exits non-zero on any problem so a badly formed *or* badly
 * designed case can never reach a queue. An empty-but-present directory is a
 * legitimate pre-content state; a missing directory is a broken checkout.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ZodType } from 'zod'
import { caseSchema, type TrialCase } from '../src/lib/caseSchema'
import { checkQueue, type QualityIssue } from '../src/lib/caseQuality'
import { docketCaseSchema, type DocketCase } from '../src/lib/v2/caseSchema'
import { checkDocketQueue } from '../src/lib/v2/caseQuality'

// Resolve relative to this script, not the process cwd, so it works the same
// from CI (repo root) and from anywhere locally.
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Queue<T> {
  name: string
  dir: string
  schema: ZodType<T>
  gate: (cases: T[]) => QualityIssue[]
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
    console.warn(`${q.name}/ has no .json cases yet — nothing to validate.`)
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
    { name: 'docket', dir: join(APP_ROOT, 'docket'), schema: docketCaseSchema, gate: checkDocketQueue },
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
