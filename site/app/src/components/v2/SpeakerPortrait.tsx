import type { DocketCase } from '../../lib/v2/caseSchema'

export function SpeakerPortrait({
  trial,
  speakerId,
  className = '',
}: {
  trial: DocketCase
  speakerId: string
  className?: string
}) {
  const asset = trial.media?.portraits?.[speakerId]
  if (!asset) return null

  return (
    <img
      src={asset.src}
      alt={asset.alt}
      className={`h-20 w-16 shrink-0 rounded-md border border-neutral-700 object-cover shadow-sm ${className}`}
      loading="lazy"
      decoding="async"
    />
  )
}
