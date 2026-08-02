/**
 * Print what the docket needs to stay daily for the rolling seven-day window.
 *
 * Run by the daily supply workflow: `--json` feeds the commissioning step, and
 * the default summary keeps a failed run legible without parsing anything.
 *
 * Usage: tsx scripts/docket-supply.ts [--json]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatPlan, planSupply } from '../src/lib/v2/docketSupply'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOCKET_DIR = join(APP_ROOT, 'docket')

/** Publish dates of every commissioned case, excluding the guided intro. */
export function publishedDates(docketDir: string = DOCKET_DIR): string[] {
  return readdirSync(docketDir)
    .filter((name) => name.endsWith('.json') && name !== 'dd-intro.json')
    .map((name) => {
      const parsed = JSON.parse(readFileSync(join(docketDir, name), 'utf8')) as {
        publish_date?: unknown
      }
      return typeof parsed.publish_date === 'string' ? parsed.publish_date : null
    })
    .filter((date): date is string => date !== null)
}

const plan = planSupply(publishedDates())
console.log(process.argv.includes('--json') ? JSON.stringify(plan, null, 2) : formatPlan(plan))
