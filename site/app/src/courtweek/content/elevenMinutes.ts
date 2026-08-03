import { courtWeekSchema } from '../model/schema'
import { validateCourtWeek } from '../model/validation'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesSessions } from './sessions'
import { elevenMinutesTrialRecord } from './trialRecord'

export const elevenMinutesCourtWeek = courtWeekSchema.parse({
  manifest: {
    schemaVersion: 'court-week-v1',
    id: 'cw-0001',
    revision: '2026.08.03-r1',
    label: 'fiction',
    title: 'Eleven Minutes',
    subtitle: 'One distress call. One deliberate hold. Your week in the jury box.',
    contentAdvisory: 'Fictional non-graphic discussion of a death during a marine emergency. Suitable for adults.',
    timezone: 'Australia/Hobart',
    releaseTag: 'court-week-cw-0001-2026.08.03-r1',
    sessions: elevenMinutesSessions,
  },
  trial: elevenMinutesTrialRecord,
  deliberation: elevenMinutesDeliberation,
})

/** Build-time evidence that this exact parsed revision satisfies the legal/content gates. */
export const elevenMinutesValidation = validateCourtWeek(elevenMinutesCourtWeek)
