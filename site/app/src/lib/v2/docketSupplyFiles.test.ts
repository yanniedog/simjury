import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { publishedDates } from '../../../scripts/docket-supply'

const roots: string[] = []

function docketRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'simjury-supply-'))
  roots.push(root)
  return root
}

function writeJson(path: string, value: unknown = {}): void {
  writeFileSync(path, JSON.stringify(value))
}

function writeBundle(root: string, id: string, publishDate: string): void {
  const bundle = join(root, id)
  mkdirSync(bundle)
  writeJson(join(bundle, 'trial.json'), { publish_date: publishDate })
  for (const name of [
    'analysis.json',
    'legal-sheet.json',
    'deliberation-pack.json',
  ]) {
    writeJson(join(bundle, name))
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true })
})

describe('docket supply file discovery', () => {
  it('measures a mixed V3 and V4 corpus without counting the guided intro', () => {
    const root = docketRoot()
    writeJson(join(root, 'dd-intro.json'), { publish_date: '2026-07-24' })
    writeJson(join(root, 'dd-0006.json'), { publish_date: '2026-07-28' })
    writeBundle(root, 'dd-0040', '2026-08-03')

    expect(publishedDates(root)).toEqual(['2026-07-28', '2026-08-03'])
  })

  it('measures a V4-only corpus from bundle trial files', () => {
    const root = docketRoot()
    writeBundle(root, 'dd-0040', '2026-08-03')
    writeBundle(root, 'dd-0041', '2026-08-06')

    expect(publishedDates(root)).toEqual(['2026-08-03', '2026-08-06'])
  })

  it('fails closed when a V4 bundle is incomplete', () => {
    const root = docketRoot()
    const bundle = join(root, 'dd-0040')
    mkdirSync(bundle)
    writeJson(join(bundle, 'trial.json'), { publish_date: '2026-08-03' })

    expect(() => publishedDates(root)).toThrow('incomplete V4 bundle')
  })

  it('fails closed on an orphaned V4 component', () => {
    const root = docketRoot()
    const bundle = join(root, 'dd-0040')
    mkdirSync(bundle)
    writeJson(join(bundle, 'analysis.json'))

    expect(() => publishedDates(root)).toThrow(
      'orphaned V4 component without trial.json',
    )
  })
})
