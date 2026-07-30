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
  const seat = (item: JurorReception) => byId.get(item.jurorId)?.seat ?? 0
  const worthShowing = receptions.filter((item) => item.reception !== 'guarded')

  // A backfire is the whole point of the read: it is the cost of the technique
  // the player just chose. Ordering purely by reception buried it — a challenge
  // that landed well with four jurors and blew up on its target pushed the one
  // item carrying "Took it personally" past the four-entry cut, leaving a
  // summary that said someone closed off and no way to see who or why.
  // Backfires come first, and the rest fill the remaining slots.
  const backfired = worthShowing
    .filter((item) => item.backfired)
    .sort((a, b) => seat(a) - seat(b))
  // Lead the rest with whoever moved most, so the player sees what the
  // technique won before the detail.
  const rest = worthShowing
    .filter((item) => !item.backfired)
    .sort((a, b) => ORDER[a.reception] - ORDER[b.reception] || seat(a) - seat(b))
  const notable = [...backfired, ...rest].slice(0, 4)

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
