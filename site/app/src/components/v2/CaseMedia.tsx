import type { MediaAsset } from '../../lib/v2/caseSchema'

export function CaseMedia({
  asset,
  priority = false,
}: {
  asset: MediaAsset
  priority?: boolean
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-2xl shadow-black/30">
      <img
        src={asset.src}
        alt={asset.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`${asset.kind === 'evidence' ? 'aspect-video' : 'aspect-[3/2]'} w-full object-cover`}
      />
      <figcaption className="border-t border-neutral-800 px-4 py-3 text-xs leading-relaxed text-neutral-400">
        {asset.caption}
      </figcaption>
    </figure>
  )
}

export function StoryText({ text, className = '' }: { text: string; className?: string }) {
  const sentences = text.match(/[^.!?]+[.!?]['”]?|[^.!?]+$/g) ?? [text]
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' ').trim())
  }
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  )
}
