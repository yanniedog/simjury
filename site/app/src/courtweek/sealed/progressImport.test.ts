import { beforeEach, describe, expect, it, vi } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import {
  exportWeeklyProgress,
  type StoredWeeklyProgress,
} from '../state/progress'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'
import { clearOpenedPackMemoryForTests, loadOpenedPack } from './packStore'
import { prepareSealedProgressImport } from './progressImport'

const packs = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)
const tuesday = elevenMinutesCourtWeek.manifest.sessions[1]
const sealedTuesday = {
  ...tuesday,
  prerequisiteSessionIds: [...tuesday.prerequisiteSessionIds, `sealed:${tuesday.id}`],
  scenes: [{
    ...tuesday.scenes[0],
    id: 'sealed-2-scene',
    cues: [{ ...tuesday.scenes[0].cues[0], id: 'sealed-2-cue' }],
  }],
}
const tuesdayNow = Date.parse('2026-08-11T08:31:00+10:00')

function currentProgress(): StoredWeeklyProgress {
  return {
    schemaVersion: 'court-week-progress-v1',
    courtWeekId: courtWeekBootstrap.id,
    revision: courtWeekBootstrap.revision,
    highestObservedTime: new Date(tuesdayNow).toISOString(),
    completedSessionIds: [],
    currentSessionId: courtWeekBootstrap.sessions[0].id,
    notes: '',
    reasoningContributions: [],
    majorityDirectionReceived: false,
  }
}

function importedTuesday(): StoredWeeklyProgress {
  return {
    ...currentProgress(),
    // A transferred timestamp is data, not authority to unlock another day.
    highestObservedTime: '2099-01-01T00:00:00.000Z',
    completedSessionIds: [courtWeekBootstrap.sessions[0].id],
    currentSessionId: tuesday.id,
    currentSceneId: tuesday.scenes[0].id,
    currentCueId: tuesday.scenes[0].cues[0].id,
    notes: 'Transferred note.',
  }
}

describe('sealed progress import preparation', () => {
  beforeEach(() => clearOpenedPackMemoryForTests())

  it('hydrates only Monday and Tuesday for a fresh-browser Tuesday transfer', async () => {
    const hydrate = vi.fn(async ({ entries }) => packs.slice(0, entries.length))
    const prepared = await prepareSealedProgressImport({
      text: exportWeeklyProgress(importedTuesday(), true),
      bootstrap: courtWeekBootstrap,
      currentProgress: currentProgress(),
      observedNow: tuesdayNow,
      baseUrl: '/packs/',
      hydrate,
    })

    expect(hydrate).toHaveBeenCalledWith(expect.objectContaining({
      entries: courtWeekBootstrap.sessions.slice(0, 2),
      persistOpened: false,
    }))
    expect(prepared.packs.map(({ ordinal }) => ordinal)).toEqual([1, 2])
    expect(prepared.progress).toMatchObject({
      completedSessionIds: [courtWeekBootstrap.sessions[0].id],
      currentSessionId: tuesday.id,
      currentSceneId: tuesday.scenes[0].id,
      currentCueId: tuesday.scenes[0].cues[0].id,
      highestObservedTime: new Date(tuesdayNow).toISOString(),
      notes: 'Transferred note.',
    })
  })

  it('rejects a locked Tuesday without invoking the pack hydrator', async () => {
    const hydrate = vi.fn(async () => packs.slice(0, 2))
    await expect(prepareSealedProgressImport({
      text: exportWeeklyProgress(importedTuesday()),
      bootstrap: courtWeekBootstrap,
      currentProgress: currentProgress(),
      observedNow: Date.parse('2026-08-10T09:00:00+10:00'),
      baseUrl: '/packs/',
      sealedSessions: [packs[0].session, sealedTuesday],
      hydrate,
    })).rejects.toThrow(/Tuesday remains sealed/i)
    expect(hydrate).not.toHaveBeenCalled()
  })

  it.each([
    ['before Tuesday unlock', Date.parse('2026-08-10T09:00:00+10:00')],
    ['after Tuesday unlock', tuesdayNow],
  ])('preserves a legitimate day-boundary export %s', async (_label, observedNow) => {
    const hydrate = vi.fn(async ({ entries }) => packs.slice(0, entries.length))
    const boundary = {
      ...importedTuesday(),
      currentSceneId: 'sealed-2-scene',
      currentCueId: 'sealed-2-cue',
    }
    const prepared = await prepareSealedProgressImport({
      text: exportWeeklyProgress(boundary),
      bootstrap: courtWeekBootstrap,
      currentProgress: currentProgress(),
      observedNow,
      baseUrl: '/packs/',
      sealedSessions: [packs[0].session, sealedTuesday],
      hydrate,
    })

    expect(hydrate).toHaveBeenCalledWith(expect.objectContaining({
      entries: courtWeekBootstrap.sessions.slice(0, 1),
      persistOpened: false,
    }))
    expect(prepared.packs.map(({ ordinal }) => ordinal)).toEqual([1])
    expect(prepared.progress).toMatchObject({
      currentSessionId: tuesday.id,
      currentSceneId: 'sealed-2-scene',
      currentCueId: 'sealed-2-cue',
    })
  })

  it('rejects a tampered non-sequential completion claim before hydration', async () => {
    const hydrate = vi.fn(async () => packs.slice(0, 3))
    await expect(prepareSealedProgressImport({
      text: exportWeeklyProgress({
        ...importedTuesday(),
        completedSessionIds: [courtWeekBootstrap.sessions[1].id],
        currentSessionId: courtWeekBootstrap.sessions[2].id,
      }),
      bootstrap: courtWeekBootstrap,
      currentProgress: currentProgress(),
      observedNow: Date.parse('2026-08-12T09:00:00+10:00'),
      baseUrl: '/packs/',
      hydrate,
    })).rejects.toThrow(/impossible Court Week chronology/i)
    expect(hydrate).not.toHaveBeenCalled()
  })

  it('does not persist hydrated packs when exact chronology validation fails', async () => {
    const tampered = {
      ...importedTuesday(),
      currentSceneId: 'wed-resume',
      currentCueId: 'wed-resume-1',
    }
    const hydrate = vi.fn(async ({ entries }) => packs.slice(0, entries.length))

    await expect(prepareSealedProgressImport({
      text: exportWeeklyProgress(tampered),
      bootstrap: courtWeekBootstrap,
      currentProgress: currentProgress(),
      observedNow: tuesdayNow,
      baseUrl: '/packs/',
      hydrate,
    })).rejects.toThrow(/impossible Court Week chronology/i)
    expect(hydrate).toHaveBeenCalledWith(expect.objectContaining({ persistOpened: false }))
    await expect(loadOpenedPack(
      courtWeekBootstrap.id,
      courtWeekBootstrap.revision,
      courtWeekBootstrap.releaseTag,
      1,
    )).resolves.toBeNull()
    await expect(loadOpenedPack(
      courtWeekBootstrap.id,
      courtWeekBootstrap.revision,
      courtWeekBootstrap.releaseTag,
      2,
    )).resolves.toBeNull()
  })
})
