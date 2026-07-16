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
      className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-3"
    >
      <p className="mb-3 text-center text-[0.65rem] uppercase tracking-[0.2em] text-amber-200/60">
        {phaseLabel} · viewed from the jury box
      </p>
      <div role="list" className="grid grid-cols-3 gap-2">
        {stations.map(({ label, member, place }) => {
          const isActive = member?.id === active?.id
          return (
            <div
              role="listitem"
              aria-current={isActive ? 'true' : undefined}
              key={label}
              className={`${place} min-w-0 rounded-lg border px-2 py-2 text-center ${
                isActive
                  ? 'border-amber-400 bg-amber-400/15 text-amber-50 shadow-[0_0_0_1px_rgb(251_191_36_/_0.25)]'
                  : 'border-white/10 bg-black/20 text-neutral-500'
              }`}
            >
              <span className="block text-[0.6rem] uppercase tracking-wider">{label}</span>
              <span className="mt-1 block truncate text-xs font-medium">
                {member?.name ?? 'Awaiting witness'}
              </span>
              {isActive && (
                <span className="mt-1 block text-[0.55rem] font-semibold uppercase tracking-wider">
                  Speaking now
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p aria-live="polite" className="sr-only">
        {active ? `${active.name}, ${active.role_label}, is speaking.` : ''}
      </p>
    </section>
  )
}
