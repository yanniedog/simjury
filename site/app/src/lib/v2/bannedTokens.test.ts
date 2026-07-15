import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docketCaseSchema } from './caseSchema'
import { makeDocketCase } from './fixtures'
import { scanDocketCaseTokens } from './bannedTokens'

describe('scanDocketCaseTokens', () => {
  it('passes the programmatic fixture', () => {
    expect(scanDocketCaseTokens(makeDocketCase())).toEqual([])
  })

  it('passes the authored dd-0000', () => {
    const raw = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docket', 'dd-0000.json'),
      'utf8',
    )
    expect(scanDocketCaseTokens(docketCaseSchema.parse(JSON.parse(raw)))).toEqual([])
  })

  it('flags a real platform name in beat text, case-insensitively', () => {
    const c = makeDocketCase()
    c.beats[0].text = `${c.beats[0].text} She posted the clip to TikTok that night.`
    const issues = scanDocketCaseTokens(c)
    expect(issues.length).toBe(1)
    expect(issues[0]).toMatch(/banned token "tiktok" in beats\[0\]\.text/)
  })

  it('flags real names anywhere player-visible: title, twist, juror lines', () => {
    const c = makeDocketCase()
    c.twist = 'the Uber receipt was forged'
    c.jury.jurors[0].lines.pushback = ['I saw it on Facebook.']
    const issues = scanDocketCaseTokens(c)
    expect(issues.some((i) => i.includes('"uber" in twist'))).toBe(true)
    expect(issues.some((i) => i.includes('"facebook"'))).toBe(true)
  })

  it('does not match inside larger words', () => {
    const c = makeDocketCase()
    c.twist = 'the metadata was disturbed' // contains no whole banned word
    expect(scanDocketCaseTokens(c)).toEqual([])
  })

  it('ignores gen_meta (authoring provenance, never player-visible)', () => {
    const c = makeDocketCase()
    c.gen_meta = {
      model: 'chatgpt-x',
      prompt_version: 'p',
      reviewer: 'r',
      batch_pr: 'b',
    }
    expect(scanDocketCaseTokens(c)).toEqual([])
  })
})
