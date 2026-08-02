import type { CourtroomTrial } from '../../lib/v2/caseSchema'

export function SpeakerPortrait({
  trial,
  speakerId,
  className = '',
}: {
  trial: CourtroomTrial
  speakerId: string
  className?: string
}) {
  const asset = trial.media?.portraits?.[speakerId]
  if (!asset) return null

  const castName = trial.cast?.find((member) => member.id === speakerId)?.name
  const alt = asset.alt?.trim() || castName || `Portrait of ${speakerId}`

  return (
    <img
      src={asset.src}
      alt={alt}
      className={`h-20 w-16 shrink-0 rounded-md border border-neutral-700 object-cover shadow-sm ${className}`}
      loading="lazy"
      decoding="async"
    />
  )
}
