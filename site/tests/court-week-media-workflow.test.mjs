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
  assert.match(generator, /pause != 0 and \(pause < 150 or pause > 1_500\)/u)
})
