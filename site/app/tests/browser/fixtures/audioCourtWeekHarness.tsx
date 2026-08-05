import { createRoot } from 'react-dom/client'
import { elevenMinutesCourtWeek } from '../../../src/courtweek/content'
import { CourtWeekApp } from '../../../src/courtweek/ui/CourtWeekApp'

export function mountRecordedAudioCourt(host: HTMLElement, instant: number): void {
  const courtWeek = structuredClone(elevenMinutesCourtWeek)
  const cue = courtWeek.manifest.sessions[0].scenes[0].cues[0]
  cue.audio = {
    opus: '/media/test-cue.opus',
    mp3: '/media/test-cue.mp3',
    segmentId: 'browser-desk-test',
    startSeconds: 0,
    endSeconds: 30,
  }
  createRoot(host).render(
    <CourtWeekApp courtWeek={courtWeek} now={() => instant} releaseBase="/media" />,
  )
}
