import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function unreservedDates(needed, activeStates) {
  const reserved = new Set(activeStates.flatMap((state) => Array.isArray(state?.dates) ? state.dates : []))
  return [...new Set(needed)].filter((date) => !reserved.has(date))
}

export function resumeCandidate(activeStates) {
  return activeStates
    .filter((state) => state?.phase === 'reserved' && Number.isInteger(state.pull_request))
    .sort((left, right) => left.pull_request - right.pull_request)[0]
}

function run() {
  const args = process.argv.slice(2)
  const value = (name) => args[args.indexOf(name) + 1]
  const needed = (value('--needed') ?? '').split(',').filter(Boolean)
  const statesPath = value('--states')
  if (!statesPath) throw new Error('usage: docket-commission-plan.mjs --needed CSV --states FILE')
  const states = JSON.parse(readFileSync(statesPath, 'utf8'))
  if (!Array.isArray(states)) throw new Error('active commission states must be an array')
  if (args.includes('--resume')) {
    const candidate = resumeCandidate(states)
    if (candidate) process.stdout.write(JSON.stringify(candidate))
    return
  }
  process.stdout.write(unreservedDates(needed, states).join(','))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { run() } catch (error) { console.error(`docket commission plan: ${error.message}`); process.exitCode = 1 }
}
