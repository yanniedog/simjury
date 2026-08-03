import { courtWeekBootstrap } from './courtweek/sealed/bootstrap'
import { SealedCourtWeekApp } from './courtweek/sealed/SealedCourtWeekApp'

/** The one active SimJury sitting: a complete seven-day Court Week. */
export default function App() {
  return (
    <SealedCourtWeekApp
      bootstrap={courtWeekBootstrap}
      releaseBase={`${import.meta.env.BASE_URL}media/court-week/cw-0001`}
    />
  )
}
