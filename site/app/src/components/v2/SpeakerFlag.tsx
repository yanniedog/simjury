export function SpeakerFlag({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <span className="speaker-flag" aria-hidden="true">
      Speaking
    </span>
  )
}
