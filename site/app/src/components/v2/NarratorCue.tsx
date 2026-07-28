import { SpeakerFlag } from './SpeakerFlag'

export function NarratorCue({
  text,
  active = false,
}: {
  text: string
  active?: boolean
}) {
  return (
    <aside
      className={`narrator-cue speech-turn${active ? ' speech-turn-active' : ''}`}
      aria-label={`Narrator${active ? ', speaking' : ''}`}
      aria-current={active ? 'true' : undefined}
    >
      <p className="speaker-heading">
        <span className="chrome-label">Narrator</span>
        <SpeakerFlag active={active} />
      </p>
      <p>{text}</p>
    </aside>
  )
}
