import { elevenMinutesCourtWeek } from './courtweek/content'
import { CourtWeekApp } from './courtweek/ui'

/** The one active SimJury sitting: a complete seven-day Court Week. */
export default function App() {
  return (
    <CourtWeekApp
      courtWeek={elevenMinutesCourtWeek}
      releaseBase={`${import.meta.env.BASE_URL}media/court-week/cw-0001`}
    />
  )
}
