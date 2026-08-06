import { beforeEach, describe, expect, it } from 'vitest'
import { elevenMinutesCourtWeek } from '../content'
import { courtWeekBootstrap } from './bootstrap'
import { createCourtDayPacks } from './packPlan'
import { clearOpenedPackMemoryForTests, loadOpenedPack, saveOpenedPack } from './packStore'

const mondayPack = createCourtDayPacks(elevenMinutesCourtWeek, courtWeekBootstrap)[0]

describe('opened sealed-pack cache', () => {
  beforeEach(() => clearOpenedPackMemoryForTests())

  it('does not reuse a pack from a different immutable media release', async () => {
    const priorReleaseTag = 'court-week-cw-0001-2026.08.03-r2'
    await saveOpenedPack(mondayPack, priorReleaseTag)

    await expect(loadOpenedPack(
      mondayPack.caseId,
      mondayPack.revision,
      priorReleaseTag,
      mondayPack.ordinal,
    )).resolves.toEqual(mondayPack)
    await expect(loadOpenedPack(
      mondayPack.caseId,
      mondayPack.revision,
      courtWeekBootstrap.releaseTag,
      mondayPack.ordinal,
    )).resolves.toBeNull()
  })
})
