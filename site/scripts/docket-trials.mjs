import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FLAT_DOCKET_RE = /^(dd-\d{4}|dd-intro)\.json$/
const CASE_ID_RE = /^(dd-\d{4}|dd-intro)$/

export function listDocketTrialIds(docketDir) {
  const ids = new Set()
  for (const entry of readdirSync(docketDir, { withFileTypes: true })) {
    let caseId = null
    if (entry.isFile() && FLAT_DOCKET_RE.test(entry.name)) {
      caseId = entry.name.replace(/\.json$/, '')
    } else if (
      entry.isDirectory() &&
      CASE_ID_RE.test(entry.name) &&
      existsSync(join(docketDir, entry.name, 'trial.json'))
    ) {
      caseId = entry.name
    }
    if (!caseId) continue
    if (ids.has(caseId)) {
      throw new Error(`Docket ${caseId} exists in both flat and bundled form`)
    }
    ids.add(caseId)
  }
  return [...ids].sort((a, b) => {
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
