/**
 * CI gate for the case queue. Validates every JSON file in cases/ against the
 * schema, then runs the design-quality gate over the whole queue (traps, real
 * signals, solvability, uniqueness, verdict variety). Exits non-zero on any
 * problem so a badly formed *or* badly designed case can never reach the queue.
 * Safe to run with no cases/.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseSchema, type TrialCase } from '../src/lib/caseSchema'
import { checkQueue } from '../src/lib/caseQuality'

// Resolve relative to this script, not the process cwd, so it works the same
// from CI (repo root) and from anywhere locally.
const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases')

function main(): void {
  let files: string[]
  try {
    files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json'))
  } catch (e) {
    // cases/ is a committed part of the repo. Its absence means a broken
    // checkout or a bad refactor, not an empty queue — fail loudly rather
    // than pass silently.
    console.error(`cases/ not found at ${CASES_DIR}; it must exist in the repo. (${(e as Error).message})`)
    process.exit(1)
  }

  if (files.length === 0) {
    // An empty-but-present directory is a legitimate pre-content state.
    console.warn('cases/ has no .json cases yet — nothing to validate.')
    return
  }

  const errors: string[] = []
  const parsed: TrialCase[] = []

  for (const file of files.sort()) {
    let json: unknown
    try {
      json = JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8'))
    } catch (e) {
      errors.push(`${file}: invalid JSON (${(e as Error).message})`)
      continue
    }

    const result = caseSchema.safeParse(json)
    if (!result.success) {
      const detail = result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')
      errors.push(`${file}: ${detail}`)
      continue
    }

    parsed.push(result.data)
  }

  // Design-quality + integrity gate over the whole queue (uniqueness, traps,
  // solvability, verdict variety). Only run once every file is schema-valid.
  if (errors.length === 0) {
    for (const issue of checkQueue(parsed)) {
      errors.push(`${issue.caseId}: ${issue.message}`)
    }
  }

  if (errors.length > 0) {
    console.error(`Case validation failed (${errors.length} problem(s)):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }

  console.log(`Validated ${files.length} case(s). All good.`)
}

main()
