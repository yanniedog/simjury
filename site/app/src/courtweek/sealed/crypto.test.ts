import { createCipheriv, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from './bootstrap'
import { BOOTSTRAP_KEY_FRAGMENT } from './keyBootstrap'
import day01 from './keys/day01'
import { createCourtDayPacks } from './packPlan'
import { decryptCourtDayPack } from './crypto'
import type { SealedPackEnvelope } from './types'

function sealedMonday(): SealedPackEnvelope {
  const pack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]
  const plaintext = Buffer.from(JSON.stringify(pack))
  const identity = Buffer.from(`cw-0001\0${courtWeekBootstrap.revision}\0${1}`)
  const key = createHash('sha256').update(Buffer.concat([
    Buffer.from(BOOTSTRAP_KEY_FRAGMENT, 'hex'),
    Buffer.from(day01, 'hex'),
    identity,
  ])).digest()
  const iv = createHash('sha256').update('test-vector').digest().subarray(0, 12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return {
    schema: 'simjury.sealed-court-day/v1',
    caseId: 'cw-0001',
    revision: courtWeekBootstrap.revision,
    ordinal: 1,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

describe('sealed pack crypto', () => {
  it('opens a matching authenticated build-time envelope', async () => {
    const opened = await decryptCourtDayPack(
      sealedMonday(),
      { caseId: 'cw-0001', revision: courtWeekBootstrap.revision, ordinal: 1 },
      day01,
    )
    expect(opened.session.day).toBe('Monday')
    expect(opened.evidence.map((item) => item.id)).toContain('ex-route')
  })

  it('rejects a modified ciphertext', async () => {
    const envelope = sealedMonday()
    const bytes = Buffer.from(envelope.ciphertext, 'base64')
    bytes[0] ^= 1
    envelope.ciphertext = bytes.toString('base64')
    await expect(decryptCourtDayPack(
      envelope,
      { caseId: 'cw-0001', revision: courtWeekBootstrap.revision, ordinal: 1 },
      day01,
    )).rejects.toThrow('integrity check')
  })
})
