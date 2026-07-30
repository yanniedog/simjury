import type { JurorProfile } from '../../engine/jurorProfile'
import type { JurorReception } from '../../engine/persuasion'
import { RECEPTION_LABEL } from '../../lib/moveCopy'

/**
 * The read of the room after the player speaks.
 *
 * Without this the player argued into a void: the tally is sealed until the
 * judge reads the result, so nothing told them whether an approach worked.
 * What is shown here is strictly *engagement* — who turned toward you, who
 * closed off — which is the feedback a real juror would actually have. It
 * carries no leaning and no count of positions, so the sealed-room invariant
 * holds.
 */

const ORDER: Record<JurorReception['reception'], number> = {
  open: 0,
  listening: 1,
  guarded: 2,
  resistant: 3,
  shut: 4,
}

export function RoomRead({
  summary,
  receptions,
  profiles,
}: {
  summary: string
  receptions: readonly JurorReception[]
  profiles: readonly JurorProfile[]
}) {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]))
  // Lead with whoever moved most, so the player sees what their technique won
  // or cost before the detail.
  const notable = [...receptions]
    .filter((item) => item.reception !== 'guarded')
    .sort(
      (a, b) =>
        ORDER[a.reception] - ORDER[b.reception]
        || (byId.get(a.jurorId)?.seat ?? 0) - (byId.get(b.jurorId)?.seat ?? 0),
    )
    .slice(0, 4)

  return (
    <section role="status" className="room-read" aria-label="How the room received that">
      <p className="room-read-summary">{summary}</p>
      {notable.length > 0 && (
        <ul className="room-read-list">
          {notable.map((item) => {
            const profile = byId.get(item.jurorId)
            const name = profile?.label.split('—')[1]?.trim() ?? profile?.label ?? 'A juror'
            return (
              <li key={item.jurorId} className={`room-read-item ${item.reception}`}>
                <span className="room-read-who">{name}</span>
                <span className="room-read-tell">{item.tell}</span>
                <span className="room-read-flags">
                  {item.ownSubject && (
                    <span className="room-read-flag own">Their subject</span>
                  )}
                  {item.discounts && (
                    <span className="room-read-flag discount">Discounts this</span>
                  )}
                  {item.backfired && (
                    <span className="room-read-flag backfire">Took it personally</span>
                  )}
                </span>
                <span className="sr-only">{RECEPTION_LABEL[item.reception]}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
