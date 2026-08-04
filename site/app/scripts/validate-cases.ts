/** Deterministic CI gate for the one active Court Week revision. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  elevenMinutesCourtWeek,
  elevenMinutesValidation,
} from '../src/courtweek/content'
import { reportCourtWeekReviewSignoffs } from './court-week-review-signoffs'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sessions = elevenMinutesCourtWeek.manifest.sessions
const expectedDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

if (sessions.length !== 7) throw new Error('Court Week must contain exactly seven sessions')
if (sessions.map((session) => session.day).join('|') !== expectedDays.join('|')) {
  throw new Error('Court Week sessions must run Monday through Sunday in order')
}

const visualRoot = join(appRoot, 'public', 'media', 'court-week', elevenMinutesCourtWeek.manifest.id)
let commissionedScenes = 0
for (const scene of sessions.flatMap((session) => session.scenes)) {
  if (!scene.visual.sources) continue
  commissionedScenes += 1
  for (const composition of ['portrait', 'tablet', 'desktop'] as const) {
    for (const format of ['avif', 'webp'] as const) {
      const path = join(visualRoot, scene.visual.sources[composition][format])
      if (!existsSync(path)) throw new Error(`Missing commissioned scene visual: ${path}`)
    }
  }
}
if (commissionedScenes !== 7) {
  throw new Error(`Expected the seven reviewed Monday scene sets; found ${commissionedScenes}`)
}

for (const session of sessions) {
  const seconds = elevenMinutesValidation.durationSeconds[session.id]
  console.log(`${session.day}: ${seconds}s (${(seconds / 60).toFixed(1)} minutes)`)
}

reportCourtWeekReviewSignoffs()

console.log(
  `Court Week validation passed: ${elevenMinutesCourtWeek.manifest.title}, `
  + `${sessions.length} sessions, fiction-pinned, legally ordered and device-ready.`,
)
