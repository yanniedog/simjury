import type { RoomOutcome } from '../../engine/deliberationV5'
import type { DocketCaseAnalysisV4, DocketCaseV4 } from '../../lib/v2/caseSchema'
import { buildShareText } from '../../lib/share'
import { ShareCard } from '../ShareCard'
import type { Verdict } from './DocketVerdict'

function epilogueText(
  epilogue: DocketCaseAnalysisV4['epilogue'],
  outcome: RoomOutcome,
): string {
  if (epilogue.mode === 'outcome_neutral') return epilogue.text
  if (outcome.kind === 'hung') return epilogue.hung
  return outcome.verdict === 'G' ? epilogue.guilty : epilogue.not_guilty
}

export function V4Reveal({
  trial,
  analysis,
  playerVerdict,
  room,
  dayNumber,
  onChooseAnother,
}: {
  trial: DocketCaseV4
  analysis: DocketCaseAnalysisV4
  playerVerdict: Verdict
  room: RoomOutcome
  dayNumber: number
  onChooseAnother: () => void
}) {
  const juryResult = room.kind === 'hung'
    ? 'No verdict — the jury was hung'
    : `${room.verdict === 'G' ? 'Guilty' : 'Not guilty'} by ${room.kind}`
  const matching = analysis.reference_verdict === playerVerdict
  const shareText = buildShareText({
    dayNumber,
    room: { kind: room.kind, g: room.tally.g, ng: room.tally.ng, u: room.tally.u },
  })

  return (
    <div className="phase-view reveal-view space-y-6">
      <header className="judgment-record border p-5 text-center">
        <p className="chrome-label">The sealed record</p>
        <h1 id="phase-heading" tabIndex={-1} className="text-neutral-50 focus:outline-none">
          The result is returned
        </h1>
        <p className="mt-3 text-sm text-neutral-300">
          Jury: <strong>{juryResult}</strong> · {room.tally.g} guilty, {room.tally.ng} not guilty,
          {' '}{room.tally.u} undecided
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          Your verdict: <strong>{playerVerdict}</strong> · Authors' reference verdict:{' '}
          <strong>{analysis.reference_verdict}</strong>
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {matching
            ? 'Your verdict matches the authors’ intended resolution.'
            : 'Your verdict differs from the authors’ intended resolution.'}{' '}
          The reference is an editorial comparison, not an objectively correct answer.
        </p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
        <h2 className="font-semibold text-neutral-100">Why the authors resolved it that way</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">{analysis.reference_reasoning}</p>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
        <h2 className="font-semibold text-neutral-100">The strongest opposing interpretation</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          {analysis.strongest_opposing_interpretation}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-neutral-100">Beat-by-beat analysis</h2>
        <ol className="space-y-3">
          {analysis.beats.map((item) => {
            const number = trial.beats.findIndex(({ id }) => id === item.beat_id) + 1
            return (
              <li key={item.beat_id} className="rounded-lg border border-neutral-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                  <span>Beat {number || item.beat_id}</span>
                  <span>{item.analysis_role.replace('_', ' ')}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">{item.analysis_note}</p>
                {item.admissibility && (
                  <p className="mt-2 text-xs text-amber-300">
                    Admissibility: {item.admissibility.effect === 'exclude_beat'
                      ? 'excluded from the jury’s reasoning'
                      : `limited to ${item.admissibility.purpose}`}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <section className="rounded-lg border border-neutral-800 p-4">
        <h2 className="font-semibold text-neutral-100">Sentencing context</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">{analysis.sentencing_context}</p>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
        <h2 className="font-semibold text-neutral-100">What happened next</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          {epilogueText(analysis.epilogue, room)}
        </p>
      </section>

      <ShareCard text={shareText} />

      <button
        type="button"
        onClick={onChooseAnother}
        className="w-full rounded-lg border border-neutral-700 px-4 py-3 font-semibold text-neutral-200 hover:bg-neutral-800"
      >
        Choose another sitting
      </button>
    </div>
  )
}
