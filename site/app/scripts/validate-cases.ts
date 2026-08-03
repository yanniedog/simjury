/** Deterministic CI gate for the one active Court Week revision. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  elevenMinutesCourtWeek,
  elevenMinutesValidation,
} from '../src/courtweek/content'

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
for (const name of ['portrait', 'tablet', 'wide']) {
  for (const format of ['avif', 'webp']) {
    const path = join(visualRoot, `courtroom-${name}.${format}`)
    if (!existsSync(path)) throw new Error(`Missing responsive courtroom visual: ${path}`)
  }
}

for (const session of sessions) {
  const seconds = elevenMinutesValidation.durationSeconds[session.id]
  console.log(`${session.day}: ${seconds}s (${(seconds / 60).toFixed(1)} minutes)`)
}

console.log(
  `Court Week validation passed: ${elevenMinutesCourtWeek.manifest.title}, `
  + `${sessions.length} sessions, fiction-pinned, legally ordered and device-ready.`,
)
