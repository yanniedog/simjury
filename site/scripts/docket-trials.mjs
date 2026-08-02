import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FLAT_DOCKET_RE = /^(dd-\d{4}|dd-intro)\.json$/
const CASE_ID_RE = /^(dd-\d{4}|dd-intro)$/

export function listDocketTrialIds(docketDir) {
  const ids = readdirSync(docketDir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile() && FLAT_DOCKET_RE.test(entry.name)) {
      return [entry.name.replace(/\.json$/, '')]
    }
    if (
      entry.isDirectory() &&
      CASE_ID_RE.test(entry.name) &&
      existsSync(join(docketDir, entry.name, 'trial.json'))
    ) {
      return [entry.name]
    }
    return []
  })
  return [...new Set(ids)].sort((a, b) => {
    if (a === 'dd-intro') return 1
    if (b === 'dd-intro') return -1
    return a.localeCompare(b)
  })
}

export function readDocketTrial(docketDir, caseId) {
  const flat = join(docketDir, `${caseId}.json`)
  const bundled = join(docketDir, caseId, 'trial.json')
  if (existsSync(flat) && existsSync(bundled)) {
    throw new Error(`Docket ${caseId} exists in both flat and bundled form`)
  }
  const file = existsSync(bundled) ? bundled : flat
  if (!existsSync(file)) throw new Error(`Unknown docket: ${caseId}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}
