import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const SESSION_ARTIFACTS = [
  'court-week-audio-cw-0001-monday',
  'court-week-audio-cw-0001-tuesday',
  'court-week-audio-cw-0001-wednesday',
  'court-week-audio-cw-0001-thursday',
  'court-week-audio-cw-0001-friday',
  'court-week-audio-cw-0001-saturday',
  'court-week-audio-cw-0001-sunday',
]

const SOURCE_ARTIFACT = 'court-week-audio-jobs'
const WORKFLOW_NAME = 'court-week-media'
const WORKFLOW_PATH = '.github/workflows/court-week-media.yml'

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function flattenArtifactPages(value) {
  const pages = Array.isArray(value) ? value : [value]
  if (!pages.length) throw new Error('GitHub returned no artifact inventory pages')
  const artifacts = pages.flatMap((page, index) => {
    const object = requireObject(page, `Artifact inventory page ${index + 1}`)
    if (!Array.isArray(object.artifacts)) throw new Error(`Artifact inventory page ${index + 1} has no artifacts array`)
    return object.artifacts
  })
  const total = requireObject(pages[0], 'Artifact inventory').total_count
  if (!Number.isInteger(total) || total !== artifacts.length) {
    throw new Error(`Artifact inventory is incomplete: GitHub reports ${total ?? 'missing'}, received ${artifacts.length}`)
  }
  return artifacts.map((artifact, index) => requireObject(artifact, `Artifact ${index + 1}`))
}

export function assertCanonicalArtifacts(value, { releaseTag, expectedRun } = {}) {
  const artifacts = flattenArtifactPages(value)
  const required = [SOURCE_ARTIFACT, ...SESSION_ARTIFACTS, ...(releaseTag ? [releaseTag] : [])]
  const failures = []
  for (const name of required) {
    const matches = artifacts.filter((artifact) => artifact.name === name)
    if (matches.length !== 1) failures.push(`${name}=${matches.length}`)
    for (const artifact of matches) {
      if (artifact.expired !== false) failures.push(`${name}=expired`)
      if (expectedRun) {
        const lineage = requireObject(artifact.workflow_run, `${name} workflow_run`)
        if (
          lineage.id !== expectedRun.id ||
          lineage.head_branch !== expectedRun.head_branch ||
          lineage.head_sha !== expectedRun.head_sha
        ) failures.push(`${name}=wrong-run`)
      }
    }
  }
  const unexpectedSessions = artifacts
    .filter((artifact) => String(artifact.name).startsWith('court-week-audio-cw-0001-'))
    .filter((artifact) => !SESSION_ARTIFACTS.includes(artifact.name))
    .map((artifact) => artifact.name)
  if (unexpectedSessions.length) failures.push(`unexpected=${unexpectedSessions.join(',')}`)
  if (failures.length) throw new Error(`Court Week artifact cardinality failed: ${failures.join('; ')}`)
  return { artifactCount: artifacts.length, requiredCount: required.length }
}

export function assertReviewedRun(runValue, artifactsValue, { repository, releaseTag, runId }) {
  const run = requireObject(runValue, 'Reviewed workflow run')
  const expectedId = Number(runId)
  const failures = []
  if (!Number.isSafeInteger(expectedId) || run.id !== expectedId) failures.push('run id')
  if (run.name !== WORKFLOW_NAME || run.path !== WORKFLOW_PATH || run.event !== 'workflow_dispatch') failures.push('workflow')
  if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) failures.push('repository')
  if (run.head_branch !== 'main' || !/^[0-9a-f]{40}$/u.test(run.head_sha ?? '')) failures.push('ref')
  if (run.status !== 'completed' || run.conclusion !== 'success') failures.push('status')
  if (failures.length) throw new Error(`Reviewed Court Week run failed provenance: ${failures.join(', ')}`)
  return assertCanonicalArtifacts(artifactsValue, { releaseTag, expectedRun: run })
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const mode = argument('--mode')
  const artifactsPath = argument('--artifacts')
  if (!artifactsPath) throw new Error('--artifacts is required')
  const artifacts = JSON.parse(readFileSync(resolve(artifactsPath), 'utf8'))
  if (mode === 'package') {
    const result = assertCanonicalArtifacts(artifacts)
    console.log(`Current run has one source artifact and exactly one artifact for each of seven Court Week sessions (${result.artifactCount} total artifacts).`)
  } else if (mode === 'publish') {
    const runPath = argument('--run')
    const repository = argument('--repository')
    const releaseTag = argument('--release-tag')
    const runId = argument('--run-id')
    if (!runPath || !repository || !releaseTag || !runId) throw new Error('Publish validation requires --run, --repository, --release-tag and --run-id')
    const result = assertReviewedRun(JSON.parse(readFileSync(resolve(runPath), 'utf8')), artifacts, { repository, releaseTag, runId })
    console.log(`Reviewed run provenance and ${result.requiredCount} required artifacts are complete.`)
  } else {
    throw new Error('--mode must be package or publish')
  }
}
