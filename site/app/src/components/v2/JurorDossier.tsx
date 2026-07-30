import type { JurorProfile, PersuasionStyle } from '../../engine/jurorProfile'
import type { JurorRelation } from '../../engine/persuasion'
import { themeList } from '../../lib/themeCopy'
import { memoryLabel, notesForOwner, type SittingNote } from '../../lib/jurorNotes'
import type { DocketCase } from '../../lib/v2/caseSchema'
import { SpeakerPortrait } from './SpeakerPortrait'

/**
 * The juror dossier — who this person is and how to reach them.
 *
 * Eleven authored jurors used to reach the player as eleven numbered seats.
 * Everything shown here is either authored (`persona`, their own notes) or a
 * derived trait projection, and all of it is deliberately about *approach*
 * rather than position: standing, attention, and what subject moves them.
 * A juror's leaning and the room's tally stay sealed until the judge reads the
 * result, so nothing in this panel can be read as a vote count.
 */

const STYLE_COPY: Record<PersuasionStyle, { label: string; how: string }> = {
  wants_a_source: {
    label: 'Wants a source',
    how: 'Name where a claim comes from. Attack the inference, not the volume.',
  },
  follows_the_bench: {
    label: 'Follows the bench',
    how: 'Reaches for the judge’s directions before the room’s mood. Hold them to it.',
  },
  moves_with_the_room: {
    label: 'Moves with the room',
    how: 'Genuinely persuadable — and just as persuadable by whoever spoke last.',
  },
  holds_the_line: {
    label: 'Holds the line',
    how: 'Will not be pushed. Concede what they got right before you separate it.',
  },
  wants_it_finished: {
    label: 'Wants it finished',
    how: 'Impatient with re-litigating. Say it once, and do not repeat yourself.',
  },
}

function standing(rapport: number): { label: string; tone: string } {
  if (rapport >= 2) return { label: 'With you', tone: 'warm' }
  if (rapport >= 0.75) return { label: 'Warming to you', tone: 'mild' }
  if (rapport > -0.75) return { label: 'Yet to take a view of you', tone: 'flat' }
  if (rapport > -2) return { label: 'Cooling on you', tone: 'cool' }
  return { label: 'Closed to you', tone: 'cold' }
}

function attention(patience: number): string {
  if (patience >= 70) return 'Still fully attentive'
  if (patience >= 35) return 'Attention thinning'
  return 'Barely listening now'
}

export function JurorDossier({
  trial,
  profile,
  relation,
  tell,
  notes,
  expanded,
  onToggle,
}: {
  trial: DocketCase
  profile: JurorProfile
  relation?: JurorRelation
  /** Their body-language read from the last exchange, if there was one. */
  tell?: string
  notes: SittingNote[]
  expanded: boolean
  onToggle: () => void
}) {
  const style = STYLE_COPY[profile.style]
  const rapport = relation?.rapport ?? 0
  const read = standing(rapport)
  const theirNotes = notesForOwner(notes, profile.id)
  const panelId = `dossier-${profile.id}`

  return (
    <li className={`dossier${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="dossier-head"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <SpeakerPortrait trial={trial} speakerId={profile.id} className="dossier-portrait" />
        <span className="dossier-head-body">
          <span className="dossier-name">{profile.label}</span>
          <span className="dossier-style">{style.label}</span>
        </span>
        <span className={`dossier-standing ${read.tone}`}>{read.label}</span>
      </button>

      <div id={panelId} className="dossier-panel" hidden={!expanded}>
        <p className="dossier-persona">{profile.persona}</p>

        <dl className="dossier-facts">
          <div>
            <dt>How to reach them</dt>
            <dd>{style.how}</dd>
          </div>
          {profile.caresAbout.length > 0 && (
            <div>
              <dt>Weighs heavily</dt>
              <dd>{themeList(profile.caresAbout)}</dd>
            </div>
          )}
          {profile.wary.length > 0 && (
            <div>
              <dt>Discounts</dt>
              <dd>{themeList(profile.wary)}</dd>
            </div>
          )}
          <div>
            <dt>Where you stand</dt>
            <dd>
              {read.label}
              {relation ? ` · ${attention(relation.patience)}` : ''}
            </dd>
          </div>
          {relation && relation.pressed > 0 && (
            <div>
              <dt>Addressed directly</dt>
              <dd>
                {relation.pressed === 1 ? 'Once' : `${relation.pressed} times`}
                {relation.pressed >= 2 ? ' — easing off would help' : ''}
              </dd>
            </div>
          )}
        </dl>

        {tell && <p className="dossier-tell">Last exchange: {profile.label.split('—')[0].trim()} {tell}.</p>}

        {theirNotes.length > 0 && (
          <div className="dossier-notes">
            <p className="dossier-notes-label">Their written notes</p>
            <ul>
              {theirNotes.map((note) => (
                <li key={note.beatId}>
                  <span>#{memoryLabel(trial, note.beatId).number}</span> “{note.text}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  )
}

export function JuryDossierPanel({
  trial,
  profiles,
  relations,
  tells,
  notes,
  expandedId,
  onExpand,
}: {
  trial: DocketCase
  profiles: readonly JurorProfile[]
  relations: Record<string, JurorRelation>
  tells: Record<string, string>
  notes: SittingNote[]
  expandedId: string | null
  onExpand: (jurorId: string | null) => void
}) {
  return (
    <div className="dossier-panel-wrap">
      <p className="dossier-intro">
        Eleven people, each with their own way in. Nothing here shows how anyone
        will vote — only how to reach them.
      </p>
      <ul className="dossier-list" aria-label="The eleven jurors">
        {[...profiles]
          .sort((a, b) => a.seat - b.seat)
          .map((profile) => (
            <JurorDossier
              key={profile.id}
              trial={trial}
              profile={profile}
              relation={relations[profile.id]}
              tell={tells[profile.id]}
              notes={notes}
              expanded={expandedId === profile.id}
              onToggle={() => onExpand(expandedId === profile.id ? null : profile.id)}
            />
          ))}
      </ul>
    </div>
  )
}
