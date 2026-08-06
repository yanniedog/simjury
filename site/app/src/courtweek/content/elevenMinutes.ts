import { courtWeekSchema } from '../model/schema'
import { validateCourtWeek } from '../model/validation'
import { elevenMinutesDeliberation } from './deliberation'
import { elevenMinutesSessions } from './sessions'
import { assertReviewedSpeakerIntegrity } from './speakerIntegrity'
import { elevenMinutesTrialRecord } from './trialRecord'

const parsedElevenMinutesCourtWeek = courtWeekSchema.parse({
  manifest: {
    schemaVersion: 'court-week-v1',
    id: 'cw-0001',
    revision: '2026.08.06-r3',
    label: 'fiction',
    title: 'Eleven Minutes',
    subtitle: 'One distress call. One deliberate hold. Your week in the jury box.',
    contentAdvisory: 'Fictional, non-graphic marine-emergency death, including an acted distress call. Pause or leave at any time; progress remains on this device. Suitable for adults.',
    timezone: 'Australia/Hobart',
    releaseTag: 'court-week-cw-0001-2026.08.03-r3',
    sessions: elevenMinutesSessions,
  },
  trial: elevenMinutesTrialRecord,
  deliberation: elevenMinutesDeliberation,
})

assertReviewedSpeakerIntegrity(parsedElevenMinutesCourtWeek.manifest.sessions)

export const elevenMinutesCourtWeek = parsedElevenMinutesCourtWeek

/** Build-time evidence that this exact parsed revision satisfies the legal/content gates. */
export const elevenMinutesValidation = validateCourtWeek(elevenMinutesCourtWeek)
