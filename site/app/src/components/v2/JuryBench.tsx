import type { DeliberationState } from '../../engine/deliberation'
import type { Verdict } from './DocketVerdict'

/**
 * The twelve seats. Leanings stay sealed until the judge reads the result;
 * before then a seat shows only who is speaking and who was just stirred.
 */
export function JuryBench({
  state,
  playerVerdict,
  activeJurorId,
  stirredIds,
  revealPositions,
  onOpenJuror,
}: {
  state: DeliberationState
  playerVerdict: Verdict | null
  activeJurorId: string | null
  stirredIds: readonly string[]
  revealPositions: boolean
  /** Opens that juror's dossier — the seats are how you learn who these people are. */
  onOpenJuror?: (jurorId: string) => void
}) {
  const playerTone = !revealPositions || !playerVerdict
    ? 'border-neutral-700 bg-neutral-900/60 text-neutral-300'
    : playerVerdict === 'Guilty'
      ? 'border-red-800 bg-red-950/40 text-red-300'
      : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
  const playerMark = revealPositions && playerVerdict
    ? (playerVerdict === 'Guilty' ? 'G' : 'NG')
    : '·'
  return (
    <div className="jury-table" role="list" aria-label="The twelve jury seats">
      <div role="listitem" className={`jury-seat player ${playerTone}`}>
        <span className="sr-only">
          {`Seat 1, you${revealPositions && playerVerdict ? `, ${playerVerdict}` : ', deliberating'}`}
        </span>
        <span aria-hidden="true">You</span>
        <small aria-hidden="true">{playerMark}</small>
      </div>
      {[...state.jurors]
        .sort((a, b) => a.seat - b.seat)
        .map((j) => {
          const isActive = j.id === activeJurorId
          const stirred = stirredIds.includes(j.id)
          const lean =
            j.position > 0 ? 'Guilty' : j.position < 0 ? 'Not guilty' : 'Undecided'
          const tone = !revealPositions
            ? `border-neutral-700 bg-neutral-900/40 text-neutral-400${isActive ? ' active' : ''}${stirred ? ' stirred' : ''}`
            : j.position > 0
              ? `border-red-800 bg-red-950/40 text-red-300${isActive ? ' active' : ''}`
              : j.position < 0
                ? `border-emerald-800 bg-emerald-950/40 text-emerald-300${isActive ? ' active' : ''}`
                : `border-amber-700 bg-amber-950/30 text-amber-300${isActive ? ' active' : ''}`
          const mark = !revealPositions
            ? '·'
            : j.position > 0
              ? 'G'
              : j.position < 0
                ? 'NG'
                : '—'
          const caption = `Seat ${j.seat}, ${j.label}${revealPositions ? `, ${lean}` : ''}${isActive ? ', speaking now' : ''}`
          if (!onOpenJuror) {
            return (
              <div
                key={j.id}
                role="listitem"
                aria-current={isActive ? 'true' : undefined}
                className={`jury-seat ${tone}`}
                title={j.label}
              >
                <span className="sr-only">{caption}</span>
                <span aria-hidden="true">{j.seat}</span>
                <small aria-hidden="true">{mark}</small>
              </div>
            )
          }
          return (
            <div key={j.id} role="listitem" className="jury-seat-cell">
              <button
                type="button"
                aria-current={isActive ? 'true' : undefined}
                className={`jury-seat interactive ${tone}`}
                title={j.label}
                onClick={() => onOpenJuror(j.id)}
              >
                <span className="sr-only">{`${caption}. Open their dossier.`}</span>
                <span aria-hidden="true">{j.seat}</span>
                <small aria-hidden="true">{mark}</small>
              </button>
            </div>
          )
        })}
    </div>
  )
}

