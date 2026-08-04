import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from './bootstrap'
import { assertNoStruckSubstanceAfterRuling, createCourtDayPacks } from './packPlan'

describe('sealed Court Week partition', () => {
  const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)

  it('keeps each day dialogue and visual mapping in that day only', () => {
    expect(packs).toHaveLength(7)
    const publicBootstrap = JSON.stringify(courtWeekBootstrap)
    for (const sourceSession of elevenMinutesCourtWeek.manifest.sessions) {
      const packed = packs.find((pack) => pack.ordinal === sourceSession.ordinal)
      const packedWithoutPresentationTurns = packed && {
        ...packed.session,
        scenes: packed.session.scenes.map((scene) => ({
          ...scene,
          cues: scene.cues.map(({ turns, ...cue }) => {
            void turns
            return cue
          }),
        })),
      }
      expect(packedWithoutPresentationTurns).toEqual(sourceSession)
      const otherDays = JSON.stringify(packs.filter((pack) => pack.ordinal !== sourceSession.ordinal))
      for (const scene of sourceSession.scenes) {
        expect(publicBootstrap).not.toContain(scene.visual.fallbackId)
        const authoredTexts = scene.cues.reduce<Array<{ id: string; text: string }>>((groups, cue) => {
          const sourceId = cue.sourceCueId ?? cue.id
          const current = groups.at(-1)
          if (current?.id === sourceId) current.text += ` ${cue.text}`
          else groups.push({ id: sourceId, text: cue.text })
          return groups
        }, [])
        for (const source of authoredTexts) expect(otherDays).not.toContain(source.text)
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

  it('ships every admitted item exactly once and never ships struck material', () => {
    const packedEvidence = packs.flatMap((pack) => pack.evidence)
    const admittedIds = elevenMinutesCourtWeek.trial.evidence
      .filter((item) => item.status === 'admitted')
      .map((item) => item.id)

    expect(packedEvidence.every((item) => item.status === 'admitted')).toBe(true)
    expect(packedEvidence.map((item) => item.id)).not.toContain('struck-rumour')
    expect(new Set(packedEvidence.map((item) => item.id))).toEqual(new Set(admittedIds))
    expect(packedEvidence).toHaveLength(admittedIds.length)
  })

  it('scans serialized post-ruling packs for the substance of struck evidence', () => {
    const futurePayload = JSON.stringify(packs.filter(({ ordinal }) => ordinal > 3))
    expect(futurePayload).not.toMatch(/had done this before|people in the office said/i)

    const contaminated = structuredClone(packs)
    contaminated[3].session.scenes[0].cues[0].text += ' People in the office said she had done this before.'
    expect(() => assertNoStruckSubstanceAfterRuling(contaminated)).toThrow(/struck evidence/)
  })

  it('carries every commissioned Monday source in Monday only', () => {
    const media = resolve('public/media/court-week/cw-0001')
    const monday = packs[0]
    expect(monday.session.scenes.every((scene) => scene.visual.sources)).toBe(true)
    for (const scene of monday.session.scenes) {
      for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
        for (const format of ['avif', 'webp'] as const) {
          const source = scene.visual.sources?.[composition][format]
          expect(source).toBe(`scenes/${scene.id}/${composition}.${format}`)
          expect(existsSync(resolve(media, source!))).toBe(true)
        }
      }
    }
    expect(JSON.stringify(packs.slice(1))).not.toContain('scenes/mon-')
  })

  it('rejects bootstrap revision or release-tag drift from the authored manifest', () => {
    expect(() => createCourtDayPacks(elevenMinutesCourtWeek, {
      ...courtWeekBootstrap,
      revision: 'drifted-revision',
    })).toThrow(/Bootstrap revision drift/)
    expect(() => createCourtDayPacks(elevenMinutesCourtWeek, {
      ...courtWeekBootstrap,
      releaseTag: 'court-week-cw-0001-2099.01.01-r9',
    })).toThrow(/Bootstrap revision drift/)
  })
})
