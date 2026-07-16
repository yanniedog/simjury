import type { CastMember, DocketCase } from '../../lib/v2/caseSchema'

function counselFor(trial: DocketCase, side: CastMember['side']) {
  return trial.cast.find(
    (member) => member.side === side && /counsel/i.test(member.role_label),
  ) ?? trial.cast.find((member) => member.side === side)
}

export function CourtroomStage({
  trial,
  activeSpeakerId,
  phaseLabel,
}: {
  trial: DocketCase
  activeSpeakerId?: string | null
  phaseLabel: string
}) {
  const active = trial.cast.find((member) => member.id === activeSpeakerId)
  const judge = trial.cast.find((member) => /judge/i.test(member.role_label))
    ?? trial.cast.find((member) => member.side === 'court')
  const prosecution = counselFor(trial, 'prosecution')
  const defence = counselFor(trial, 'defence')
  const fixedIds = new Set([judge?.id, prosecution?.id, defence?.id])
  const floorSpeaker = active && !fixedIds.has(active.id) ? active : undefined
  const stations: Array<{
    label: string
    member?: CastMember
    place: string
  }> = [
    { label: 'Bench', member: judge, place: 'col-start-2' },
    { label: 'Prosecution', member: prosecution, place: 'col-start-1 row-start-2' },
    { label: 'Witness stand', member: floorSpeaker, place: 'col-start-2 row-start-2' },
    { label: 'Defence', member: defence, place: 'col-start-3 row-start-2' },
  ]

  return (
    <section
      aria-label={`Courtroom stage: ${phaseLabel}`}
      className="courtroom-stage"
    >
      <div className="stage-heading"><span>Live courtroom</span><strong>{phaseLabel}</strong></div>
      <div role="list" className="stage-map">
        {stations.map(({ label, member, place }) => {
          const isActive = Boolean(active && member && member.id === active.id)
          return (
            <div
              role="listitem"
              aria-current={isActive ? 'true' : undefined}
              key={label}
              className={`${place} stage-station ${isActive ? 'active' : ''}`}
            >
              <span className="station-label">{label}</span>
              <span className="station-name">
                {member?.name ?? 'Awaiting witness'}
              </span>
              {isActive && (
                <span className="station-live">
                  Speaking now
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="jury-edge"><span>You are here</span><strong>Juror 01 · Jury box</strong></div>
      <p aria-live="polite" className="sr-only">
        {active ? `${active.name}, ${active.role_label}, is speaking.` : ''}
      </p>
    </section>
  )
}
