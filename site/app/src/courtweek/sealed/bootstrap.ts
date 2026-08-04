import type { CourtWeekBootstrap } from './types'

/**
 * Public, deliberately non-narrative schedule data. Authored dialogue, scene
 * titles, evidence labels and media mappings are emitted only in sealed packs.
 */
export const courtWeekBootstrap: CourtWeekBootstrap = {
  schemaVersion: 'court-week-sealed-v1',
  id: 'cw-0001',
  revision: '2026.08.03-r1',
  label: 'fiction',
  title: 'Eleven Minutes',
  subtitle: 'One distress call. One deliberate hold. Your week in the jury box.',
  contentAdvisory: 'Fictional, non-graphic marine-emergency death, including an acted distress call. Pause or leave at any time; progress remains on this device. Suitable for adults.',
  timezone: 'Australia/Hobart',
  releaseTag: 'court-week-cw-0001-2026.08.03-r1',
  sessions: [
    { id: 'cw-0001-monday', ordinal: 1, day: 'Monday', unlockAt: '2026-08-10T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: [], locator: '3999223499cc6bb30eba7267.sjp' },
    { id: 'cw-0001-tuesday', ordinal: 2, day: 'Tuesday', unlockAt: '2026-08-11T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-monday'], locator: '5243d2617888cf2b8d20a0b9.sjp' },
    { id: 'cw-0001-wednesday', ordinal: 3, day: 'Wednesday', unlockAt: '2026-08-12T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-tuesday'], locator: 'c164bc49312297b0bb29e394.sjp' },
    { id: 'cw-0001-thursday', ordinal: 4, day: 'Thursday', unlockAt: '2026-08-13T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-wednesday'], locator: '390363ebdc282bfc8cd50bb6.sjp' },
    { id: 'cw-0001-friday', ordinal: 5, day: 'Friday', unlockAt: '2026-08-14T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-thursday'], locator: 'a23f86a20add1f88f089193f.sjp' },
    { id: 'cw-0001-saturday', ordinal: 6, day: 'Saturday', unlockAt: '2026-08-15T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-friday'], locator: '8959afff4482546c429b2cb4.sjp' },
    { id: 'cw-0001-sunday', ordinal: 7, day: 'Sunday', unlockAt: '2026-08-16T08:30:00+10:00', targetMinutes: 20, prerequisiteSessionIds: ['cw-0001-saturday'], locator: '29799df1c6beefabbeceddc4.sjp' },
  ],
}
