import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkActiveMediaFiles,
  discoverDocketFiles,
  loadDocketFiles,
} from '../../../scripts/docket-files'
import { docketCaseV4Schema, type DocketCaseV4 } from './caseSchema'
import { makeDocketCase, prose } from './fixtures'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const temporaryRoots: string[] = []

function temporaryDocket(): string {
  const root = mkdtempSync(join(tmpdir(), 'simjury-docket-'))
  temporaryRoots.push(root)
  return root
}

function writeJson(file: string, value: unknown = {}): void {
  writeFileSync(file, JSON.stringify(value))
}

function makeV4Trial(): DocketCaseV4 {
  const raw = structuredClone(makeDocketCase()) as unknown as Record<string, unknown>
  delete raw.reference_verdict
  delete raw.twist
  delete raw.epilogue
  delete (raw.accused as Record<string, unknown>).if_guilty
  for (const beat of raw.beats as Array<Record<string, unknown>>) {
    delete beat.true_weight
    delete beat.reveal_stamp
    delete beat.reveal_note
  }
  Object.assign(raw, {
    offence_code: 'murder',
    content_advisories: ['death'],
    detail_level: 'non_graphic',
    gen_meta: {
      ...(raw.gen_meta as object),
      prompt_version: 'dd-2026-v4',
      language_reviewer: 'Language reviewer',
      sensitivity_reviewer: 'Sensitivity reviewer',
    },
  })
  raw.setting = `${raw.setting} ${prose(130)}`
  const statements = raw.statements as Record<
    'opening' | 'closing',
    Record<'prosecution' | 'defence', { text: string }>
  >
  for (const phase of Object.values(statements)) {
    for (const statement of Object.values(phase)) {
      statement.text = `${statement.text} ${prose(30)}`
    }
  }
  for (const beat of raw.beats as Array<{
    text: string
    turns?: Array<{ text: string }>
  }>) {
    if (beat.turns?.length) beat.turns.at(-1)!.text += ` ${prose(33)}`
    else beat.text += ` ${prose(33)}`
  }
  return docketCaseV4Schema.parse(raw)
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true })
  }
})

describe('docket disk discovery', () => {
  it('discovers flat cases and exact four-file V4 bundles', () => {
    const docket = temporaryDocket()
    writeJson(join(docket, 'dd-flat.json'))
    const bundle = join(docket, 'dd-v4')
    mkdirSync(bundle)
    for (const name of [
      'trial.json',
      'analysis.json',
      'legal-sheet.json',
      'deliberation-pack.json',
    ]) writeJson(join(bundle, name))

    const discovered = discoverDocketFiles(docket)
    expect(discovered.errors).toEqual([])
    expect(discovered.flatCases).toEqual([join(docket, 'dd-flat.json')])
    expect(discovered.bundles).toHaveLength(1)
    expect(discovered.bundles[0].id).toBe('dd-v4')
  })

  it('rejects missing and orphaned bundle files', () => {
    const docket = temporaryDocket()
    const bundle = join(docket, 'dd-broken')
    mkdirSync(bundle)
    writeJson(join(bundle, 'analysis.json'))
    writeJson(join(bundle, 'notes.json'))

    const discovered = discoverDocketFiles(docket)
    expect(discovered.bundles).toEqual([])
    expect(discovered.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('missing trial.json'),
      expect.stringContaining('notes.json: orphaned V4 JSON file'),
    ]))
  })

  it('runs the schema for every component found on disk', () => {
    const docket = temporaryDocket()
    const bundle = join(docket, 'dd-invalid')
    mkdirSync(bundle)
    for (const name of [
      'trial.json',
      'analysis.json',
      'legal-sheet.json',
      'deliberation-pack.json',
    ]) writeJson(join(bundle, name))

    const loaded = loadDocketFiles(docket)
    for (const name of [
      'trial.json',
      'analysis.json',
      'legal-sheet.json',
      'deliberation-pack.json',
    ]) {
      expect(loaded.errors.some((error) => error.includes(name))).toBe(true)
    }
  })

  it('rejects schema-valid V4 courtroom semantics through the disk loader', () => {
    const docket = temporaryDocket()
    const trial = makeV4Trial()
    trial.beats[1].interjections = [
      {
        id: 'same-side-objection',
        after_turn: 1,
        speaker: 'defc',
        type: 'objection',
        ground: 'hearsay',
        text: 'Objection, hearsay.',
      },
      {
        id: 'same-side-ruling',
        after_turn: 1,
        speaker: 'judge',
        type: 'overruled',
        resolves: 'same-side-objection',
        text: 'Overruled. The witness may answer.',
      },
    ]
    expect(docketCaseV4Schema.safeParse(trial).success).toBe(true)

    const bundle = join(docket, trial.id)
    mkdirSync(bundle)
    writeJson(join(bundle, 'trial.json'), trial)
    for (const name of [
      'analysis.json',
      'legal-sheet.json',
      'deliberation-pack.json',
    ]) writeJson(join(bundle, name))

    expect(loadDocketFiles(docket).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('objection same-side-objection must come from opposing counsel'),
    ]))
  })
})

describe('active media completeness', () => {
  it('validates the repository corpus and every declared file on disk', () => {
    const loaded = loadDocketFiles(join(APP_ROOT, 'docket'))
    expect(loaded.errors).toEqual([])
    expect(loaded.v3Cases.length).toBeGreaterThan(0)
    expect(checkActiveMediaFiles(
      [...loaded.v3Cases, ...loaded.v4Cases],
      join(APP_ROOT, 'public'),
    )).toEqual([])
  }, 30_000)

  it('rejects cross-case traversal and a missing required portrait', () => {
    const loaded = loadDocketFiles(join(APP_ROOT, 'docket'))
    const trial = structuredClone(loaded.v3Cases[0])
    trial.media!.cover.src = `/today/media/${trial.id}/../elsewhere.webp`
    delete trial.media!.portraits![trial.cast[0].id]

    const issues = checkActiveMediaFiles([trial], join(APP_ROOT, 'public'))
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('outside its case') }),
      expect.objectContaining({ message: expect.stringContaining('missing portrait') }),
    ]))
  }, 30_000)
})
