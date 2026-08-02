import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { courtroomLines } from '../scripts/courtroom-lines.mjs'
import { listDocketTrialIds, readDocketTrial } from '../scripts/docket-trials.mjs'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))

function listedCases(script) {
  return JSON.parse(execFileSync(
    process.execPath,
    [`scripts/${script}`, '--case', 'all', '--list'],
    { cwd: siteRoot, encoding: 'utf8' },
  ))
}

test('both narration engines can build the varied narrator cue corpus', () => {
  const kokoro = listedCases('build-kokoro-jobs.mjs')
  const scylla = listedCases('build-scylla-jobs.mjs')
  const expected = listDocketTrialIds(join(siteRoot, 'app', 'docket'))

  assert.deepEqual(scylla, kokoro)
  assert.deepEqual(scylla, expected)
  assert.ok(scylla.includes('dd-intro'))
})

test('courtroom narration preserves exact objection and ruling order', () => {
  const lines = courtroomLines({
    speaker: 'witness',
    text: 'Fallback.',
    turns: [
      { speaker: 'counsel', text: 'The question.' },
      { speaker: 'witness', text: 'The answer.' },
    ],
    interjections: [
      {
        id: 'hearsay-objection',
        after_turn: 2,
        speaker: 'opposing-counsel',
        text: 'Objection, hearsay.',
      },
      {
        after_turn: 2,
        speaker: 'judge',
        text: 'Sustained. Disregard the answer.',
      },
    ],
  })

  assert.deepEqual(lines.map(({ speaker }) => speaker), [
    'counsel',
    'witness',
    'opposing-counsel',
    'judge',
  ])
  assert.equal(lines[2].id, 'hearsay-objection')
})

test('courtroom narration supports pre-turn, fallback and multiple anchors', () => {
  const fallback = courtroomLines({
    speaker: 'witness',
    text: 'Fallback.',
    interjections: [{ after_turn: 0, speaker: 'bailiff', text: 'All rise.' }],
  })
  assert.deepEqual(fallback.map(({ speaker }) => speaker), ['bailiff', 'witness'])

  const anchored = courtroomLines({
    speaker: 'witness',
    text: 'Fallback.',
    turns: [
      { speaker: 'counsel', text: 'The question.' },
      { speaker: 'witness', text: 'The answer.' },
    ],
    interjections: [
      { after_turn: 0, speaker: 'bailiff', text: 'All rise.' },
      { after_turn: 1, speaker: 'opposing-counsel', text: 'Objection, leading.' },
      { after_turn: 2, speaker: 'judge', text: 'Overruled.' },
    ],
  })
  assert.deepEqual(anchored.map(({ speaker }) => speaker), [
    'bailiff', 'counsel', 'opposing-counsel', 'witness', 'judge',
  ])
})

test('narration discovers both flat and four-file V4 trial locations', () => {
  const root = mkdtempSync(join(tmpdir(), 'simjury-narration-'))
  try {
    writeFileSync(join(root, 'dd-0040.json'), JSON.stringify({ id: 'dd-0040' }))
    mkdirSync(join(root, 'dd-0041'))
    writeFileSync(
      join(root, 'dd-0041', 'trial.json'),
      JSON.stringify({ id: 'dd-0041' }),
    )
    writeFileSync(join(root, 'dd-intro.json'), JSON.stringify({ id: 'dd-intro' }))
    writeFileSync(join(root, 'README.md'), 'not a docket')
    writeFileSync(join(root, 'dd-foo.json'), '{}')
    mkdirSync(join(root, 'notes'))
    assert.deepEqual(listDocketTrialIds(root), ['dd-0040', 'dd-0041', 'dd-intro'])
    assert.equal(readDocketTrial(root, 'dd-0041').id, 'dd-0041')
  } finally {
    rmSync(root, { recursive: true })
  }
})

test('narration trial discovery and reads fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'simjury-narration-'))
  try {
    writeFileSync(join(root, 'dd-0042.json'), JSON.stringify({ id: 'dd-0042' }))
    mkdirSync(join(root, 'dd-0042'))
    writeFileSync(
      join(root, 'dd-0042', 'trial.json'),
      JSON.stringify({ id: 'dd-0042' }),
    )
    assert.throws(() => listDocketTrialIds(root), /both flat and bundled/)
    assert.throws(() => readDocketTrial(root, 'dd-0042'), /both flat and bundled/)
    assert.throws(() => readDocketTrial(root, 'dd-9999'), /Unknown docket/)
  } finally {
    rmSync(root, { recursive: true })
  }
})

test('narration workflows rebuild for shared helpers and bundled intro trials', () => {
  for (const workflow of ['natural-narration.yml', 'scylla-narration.yml']) {
    const source = readFileSync(join(siteRoot, '..', '.github', 'workflows', workflow), 'utf8')
    assert.match(source, /site\/scripts\/courtroom-lines\.mjs/)
    assert.match(source, /site\/scripts\/docket-trials\.mjs/)
    assert.match(source, /build-(kokoro|scylla)-jobs\|courtroom-lines\|docket-trials/)
  }
  const natural = readFileSync(
    join(siteRoot, '..', '.github', 'workflows', 'natural-narration.yml'),
    'utf8',
  )
  assert.equal(
    natural.match(/\(dd-\[0-9\]\{4\}\|dd-intro\)\/trial\\\.json/g)?.length,
    2,
  )
})
