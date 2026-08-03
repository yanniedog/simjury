import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'

describe('sealed Court Week partition', () => {
  const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)

  it('keeps each day dialogue and visual mapping in that day only', () => {
    expect(packs).toHaveLength(7)
    const publicBootstrap = JSON.stringify(courtWeekBootstrap)
    for (const sourceSession of elevenMinutesCourtWeek.manifest.sessions) {
      const packed = packs.find((pack) => pack.ordinal === sourceSession.ordinal)
      expect(packed?.session).toEqual(sourceSession)
      const otherDays = JSON.stringify(packs.filter((pack) => pack.ordinal !== sourceSession.ordinal))
      for (const scene of sourceSession.scenes) {
        expect(publicBootstrap).not.toContain(scene.visual.fallbackId)
        for (const cue of scene.cues) expect(otherDays).not.toContain(cue.text)
      }
    }
  })

  it('reveals exhibits only on first use and holds deliberation until Saturday', () => {
    const mondayEvidence = new Set(packs[0].evidence.map((item) => item.id))
    expect(mondayEvidence).toContain('ex-route')
    expect(mondayEvidence).not.toContain('ex-distress')
    expect(mondayEvidence.size).toBeLessThan(elevenMinutesCourtWeek.trial.evidence.length)
    expect(packs.slice(0, 5).every((pack) => pack.deliberation === undefined)).toBe(true)
    expect(packs[5].deliberation).toEqual(elevenMinutesCourtWeek.deliberation)
  })

  it('has every shared responsive artwork fallback required by sealed scenes', () => {
    const media = resolve('public/media/court-week/cw-0001')
    for (const composition of ['portrait', 'tablet', 'wide']) {
      for (const format of ['avif', 'webp']) {
        expect(existsSync(resolve(media, `courtroom-${composition}.${format}`))).toBe(true)
      }
    }
  })
})
