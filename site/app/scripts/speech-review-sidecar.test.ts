import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCourtWeekSpeechReviewLedger } from '../src/courtweek/content/speechReviewLedger'
import {
  REVIEW_DIMENSIONS, SPEECH_REVIEW_SIDECAR_PATH, assertSpeechReviewSidecar,
  buildSpeechReviewSidecar, tokeniseForReview, verifySpeechReviewSidecarFile,
  writeSpeechReviewSidecar,
} from './speech-review-sidecar'

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

describe('speech review sidecar', () => {
  it('covers every candidate and runtime row with exact forensic fields and pending decisions', () => {
    const ledger = buildCourtWeekSpeechReviewLedger()
    const sidecar = buildSpeechReviewSidecar()
    expect(sidecar.rows).toHaveLength(ledger.rows.length)
    expect(new Set(sidecar.rows.map(({ rowId }) => rowId)).size).toBe(ledger.rows.length)
    expect(sidecar.runtimeVariants).toEqual([
      'analysis:manslaughter', 'analysis:murder', 'analysis:not-guilty',
      'analysis:unable-to-agree', 'manslaughter:majority', 'manslaughter:unanimous',
      'murder:majority', 'murder:unanimous', 'not-guilty:majority',
      'not-guilty:unanimous', 'unable-to-agree:hung',
    ])
    for (const [index, row] of sidecar.rows.entries()) {
      const source = ledger.rows[index]!
      expect(row.rowId).toBe(source.turnId)
      expect(row.sourceSha256).toBe(sha256(JSON.stringify(source.activeSourceText)))
      expect(row.candidateSha256).toBe(sha256(source.text))
      expect(row.ledgerRowSha256).toBe(sha256(JSON.stringify(source)))
      expect(Object.keys(row.decisions).sort()).toEqual([...REVIEW_DIMENSIONS].sort())
      expect(Object.values(row.decisions)).toEqual(REVIEW_DIMENSIONS.map(() => ({
        status: 'pending', reviewReference: null, note: null,
      })))
      expect(row.candidateTokens).toEqual(tokeniseForReview(source.text))
      for (const sourceCueId of row.sourceCueIds) {
        const sourceLedger = sidecar.sources.find((candidate) => candidate.sourceCueId === sourceCueId)
        const sourceText = source.activeSourceText.find(([id]) => id === sourceCueId)?.[1]
        expect(sourceLedger?.sourceSha256).toMatch(/^[a-f0-9]{64}$/u)
        expect(sourceLedger?.tokens).toEqual(tokeniseForReview(sourceText ?? ''))
      }
      for (const [text, start, end] of row.candidateTokens) expect(source.text.slice(start, end)).toBe(text)
      expect(row.candidateTokens.map(([text]) => text).join('')).toBe(source.text.replace(/\s/gu, ''))
      expect(row.actor.id).toBe(source.actorId)
      expect(row.speechMode).toBe(source.speechMode)
      expect(row.legalAction).toBe(source.legalAction)
      expect(row.quoteProvenance).toEqual(source.quotes)
    }
    expect(sidecar.rows.flatMap(({ candidateTokens }) => candidateTokens).some((token) => token[3] === 'punctuation')).toBe(true)
  })

  it('only supplies neighbouring legal state inside deterministic branches', () => {
    const sidecar = buildSpeechReviewSidecar()
    const linearIndex = sidecar.rows.findIndex((row, index) => {
      const previous = sidecar.rows[index - 1]
      return row.day === 'monday' && row.runtimeVariant === null && previous?.day === row.day && previous.cueId !== row.cueId
    })
    expect(sidecar.rows[linearIndex]!.precedingLegalState?.rowId).toBe(sidecar.rows[linearIndex - 1]!.rowId)
    const branchIndex = sidecar.rows.findIndex(({ runtimeVariant }) => runtimeVariant !== null)
    expect(sidecar.rows[branchIndex]!.precedingLegalState).toBeNull()
    const sundayBranchIndex = sidecar.rows.findIndex((row, index) => {
      const previous = sidecar.rows[index - 1]
      return row.day === 'sunday' && row.runtimeVariant === null && previous?.day === row.day && previous.cueId !== row.cueId
    })
    expect(sidecar.rows[sundayBranchIndex]!.precedingLegalState).toBeNull()
    expect(sidecar.rows[sundayBranchIndex - 1]!.followingLegalState).toBeNull()
    const returnRows = sidecar.rows.filter(({ runtimeVariant }) => runtimeVariant === 'murder:unanimous')
    expect(returnRows.length).toBeGreaterThan(1)
    expect(returnRows[0]!.followingLegalState?.rowId).toBe(returnRows[1]!.rowId)
  })

  it('fails closed on missing, stale and purportedly reviewed rows', () => {
    const missing = structuredClone(buildSpeechReviewSidecar())
    missing.rows.pop()
    expect(() => assertSpeechReviewSidecar(missing)).toThrow(/missing or extra rows/u)

    const stale = structuredClone(buildSpeechReviewSidecar())
    stale.rows[0]!.candidateSha256 = '0'.repeat(64)
    expect(() => assertSpeechReviewSidecar(stale)).toThrow(/stale or reordered/u)

    const droppedToken = structuredClone(buildSpeechReviewSidecar())
    droppedToken.rows[0]!.candidateTokens.pop()
    expect(() => assertSpeechReviewSidecar(droppedToken)).toThrow(/stale or reordered/u)

    const unreferenced = structuredClone(buildSpeechReviewSidecar())
    unreferenced.rows[0]!.decisions.attribution.status = 'approved'
    expect(() => assertSpeechReviewSidecar(unreferenced)).toThrow(/needs a review reference/u)

    const referenced = structuredClone(buildSpeechReviewSidecar())
    referenced.rows[0]!.decisions.attribution = {
      status: 'approved', reviewReference: 'review/example', note: null,
    }
    expect(() => assertSpeechReviewSidecar(referenced)).not.toThrow()
  })

  it('verifies the deterministic non-runtime export', async () => {
    await expect(verifySpeechReviewSidecarFile()).resolves.toBeUndefined()
    const checked = JSON.parse(await readFile(SPEECH_REVIEW_SIDECAR_PATH, 'utf8'))
    expect(() => assertSpeechReviewSidecar(checked)).not.toThrow()
  })

  it('preserves reviewed decisions and refuses to overwrite stale review work', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'simjury-speech-review-'))
    const path = join(directory, 'sidecar.json')
    try {
      await writeSpeechReviewSidecar(path)
      const pending = JSON.parse(await readFile(path, 'utf8'))
      pending.rows[0].candidateSha256 = '0'.repeat(64)
      await writeFile(path, JSON.stringify(pending) + '\n', 'utf8')
      await writeSpeechReviewSidecar(path)
      const reviewed = JSON.parse(await readFile(path, 'utf8'))
      expect(reviewed.rows[0].candidateSha256).not.toBe('0'.repeat(64))
      reviewed.rows[0].decisions.attribution = {
        status: 'approved', reviewReference: 'review/example', note: 'Checked by a human.',
      }
      await writeFile(path, JSON.stringify(reviewed) + '\n', 'utf8')
      await writeSpeechReviewSidecar(path)
      const preserved = JSON.parse(await readFile(path, 'utf8'))
      expect(preserved.rows[0].decisions.attribution).toEqual(reviewed.rows[0].decisions.attribution)

      preserved.rows[0].candidateSha256 = '0'.repeat(64)
      await writeFile(path, JSON.stringify(preserved) + '\n', 'utf8')
      const stale = await readFile(path, 'utf8')
      await expect(writeSpeechReviewSidecar(path)).rejects.toThrow(/stale or reordered/u)
      await expect(readFile(path, 'utf8')).resolves.toBe(stale)
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})
