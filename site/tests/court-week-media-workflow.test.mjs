import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('../.github/workflows/court-week-media.yml', 'utf8')
const requirements = readFileSync('narration-requirements.txt', 'utf8')
const generator = readFileSync('scripts/generate-court-week-audio.py', 'utf8')

test('trusted Court Week media workflow pins every external action and runner', () => {
  const externalActions = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s+([^\s#]+)/gmu)]
    .map((match) => match[1])
  assert.ok(externalActions.length > 0)
  for (const action of externalActions) {
    assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u)
  }
  assert.doesNotMatch(workflow, /runs-on:\s+ubuntu-latest/u)
  const runners = [...workflow.matchAll(/^\s*runs-on:\s+([^\s#]+)/gmu)].map((match) => match[1])
  assert.ok(runners.length > 0)
  assert.ok(runners.every((runner) => runner === 'ubuntu-24.04'))
})

test('review packaging fails closed unless all scene art is release ready', () => {
  assert.match(workflow, /--require-release-ready-art/u)
})

test('review-candidate tags are confined to non-publishing media jobs', () => {
  const buildStep = workflow.match(
    /- name: Build deterministic prerecorded-audio jobs[\s\S]*?(?=\n\s+- name:)/u,
  )?.[0] ?? ''
  const runBlock = buildStep.match(/run: >-[\s\S]*/u)?.[0] ?? ''
  const publishHeader = /^  publish:\r?$/mu.exec(workflow)
  assert.ok(publishHeader, 'publish job must remain present')
  const publishStart = publishHeader.index
  const nextJob = /^  [a-z][a-z0-9-]*:\r?$/gmu
  nextJob.lastIndex = publishStart + publishHeader[0].length
  const followingJob = nextJob.exec(workflow)
  const publishJob = workflow.slice(publishStart, followingJob?.index ?? workflow.length)

  assert.match(workflow, /inputs\.publish != true/u)
  assert.match(
    buildStep,
    /env:\s*\n\s+REVIEW_CANDIDATE_RELEASE_TAG: \$\{\{ inputs\.release_tag \}\}/u,
  )
  assert.match(runBlock, /--review-candidate-release-tag "\$REVIEW_CANDIDATE_RELEASE_TAG"/u)
  assert.doesNotMatch(runBlock, /\$\{\{\s*inputs\.release_tag\s*\}\}/u)
  assert.doesNotMatch(publishJob, /--review-candidate-release-tag/u)
  assert.match(workflow, /Requested release tag does not match generated review-candidate jobs/u)
})

test('package and publish fail closed on reviewed-run artifact provenance', () => {
  assert.equal((workflow.match(/actions: read/gu) ?? []).length, 2)
  assert.doesNotMatch(workflow, /actions: write/u)
  assert.match(workflow, /assert-court-week-media-run\.mjs[\s\S]*?--mode package/u)
  assert.match(workflow, /assert-court-week-media-run\.mjs[\s\S]*?--mode publish/u)
  assert.match(workflow, /actions\/runs\/\$GITHUB_RUN_ID\/artifacts\?per_page=100/u)
  assert.match(workflow, /actions\/runs\/\$REVIEWED_RUN_ID\/artifacts\?per_page=100/u)
})

test('synthesis inputs are exact and the immutable Kokoro revision is explicit', () => {
  const declared = requirements.split(/\r?\n/u).filter(Boolean)
  assert.ok(declared.length > 0)
  for (const requirement of declared) {
    assert.match(requirement, /^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_.-]+\])?==[^=<>~!]+$/u)
  }
  const requirementVersions = Object.fromEntries(declared.map((requirement) => {
    const [packageName, version] = requirement.split('==')
    return [packageName.replace(/\[.*\]$/u, '').replaceAll('-', '_').toLowerCase(), version]
  }))
  const pinnedBlock = generator.match(/PINNED_PYTHON_PACKAGES = \{(?<entries>.*?)\n\}/su)?.groups?.entries
  assert.ok(pinnedBlock)
  const generatorVersions = Object.fromEntries(
    [...pinnedBlock.matchAll(/"([^"]+)": "([^"]+)"/gu)].map((match) => [match[1], match[2]]),
  )
  assert.deepEqual(generatorVersions, requirementVersions)
  assert.match(generator, /KOKORO_REPOSITORY = "hexgrad\/Kokoro-82M"/u)
  assert.match(generator, /KOKORO_REVISION = "[0-9a-f]{40}"/u)
  assert.match(generator, /revision=KOKORO_REVISION/gu)
  assert.match(generator, /kokoroConfigSha256/u)
  assert.match(generator, /kokoroModelSha256/u)
  assert.match(generator, /"espeakNg":/u)
  assert.match(generator, /with torch\.inference_mode\(\):/u)
  assert.doesNotMatch(generator, /KPipeline\(lang_code=language\)/u)
  assert.match(generator, /isinstance\(pause, bool\) or not isinstance\(pause, int\)/u)
  assert.match(generator, /pause != 0 and \(pause < 150 or pause > 1_500\)/u)
  assert.match(generator, /result\.tokens/u)
  assert.match(generator, /align_utterance_parts/u)
  assert.match(generator, /Kokoro token text does not reconstruct/u)
})
